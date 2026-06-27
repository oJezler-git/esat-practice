import type {
  Attempt,
  CategoryStat,
  Question,
  Session,
  SessionSummary,
  StatDimension,
  TopicStat,
} from "../types/schema";
import { scoreSession } from "./scorer";
import { applyTopicBreakdownToStat } from "./progress";
import { normalizeResult } from "./result";

export interface AggregateStatsInput {
  /** All sessions; only those with state "completed" contribute. */
  sessions: Session[];
  /** Attempts grouped by their session id. */
  attemptsBySession: Map<string, Attempt[]>;
  /** Question lookup by id, used to resolve topics and drop deleted questions. */
  questionById: Map<string, Question>;
  /** Question ids excluded from stats (e.g. user-hidden questions). */
  excludedQuestionIds?: Set<string>;
}

/** A completed session's attempts joined to their questions, deduplicated. */
interface SessionEntry {
  question: Question;
  attempt: Attempt;
}

/** Returns completed sessions oldest-first so EWMA replay is deterministic. */
function completedSessionsChronologically(sessions: Session[]): Session[] {
  return sessions
    .filter((session) => session.state === "completed")
    .sort(
      (left, right) =>
        (left.completed_at ?? left.created_at) -
        (right.completed_at ?? right.created_at),
    );
}

/**
 * Joins a session's attempts to their questions, dropping excluded/deleted ones
 * and counting each question once (latest attempt wins, first-seen order kept).
 */
function buildSessionEntries(
  attempts: Attempt[],
  questionById: Map<string, Question>,
  excludedQuestionIds: Set<string>,
): SessionEntry[] {
  const byQuestion = new Map<string, SessionEntry>();
  const ordered: SessionEntry[] = [];

  for (const attempt of attempts) {
    if (excludedQuestionIds.has(attempt.question_id)) {
      continue;
    }
    const question = questionById.get(attempt.question_id);
    if (!question) {
      continue;
    }
    const existing = byQuestion.get(attempt.question_id);
    if (existing) {
      existing.attempt = attempt;
    } else {
      const entry: SessionEntry = { question, attempt };
      byQuestion.set(attempt.question_id, entry);
      ordered.push(entry);
    }
  }

  return ordered;
}

/**
 * Derives per-topic statistics deterministically from the attempts store.
 *
 * Completed sessions are replayed in chronological order so that the EWMA
 * accuracy is reproducible from source (rather than depending on the live order
 * of submissions). Each session's per-topic breakdown is computed with the same
 * {@link scoreSession} used at submit time, then folded into the running stat via
 * {@link applyTopicBreakdownToStat}. Excluded or deleted questions are filtered
 * out, so this is the single source of truth for the `stats` store.
 */
export function aggregateTopicStats({
  sessions,
  attemptsBySession,
  questionById,
  excludedQuestionIds = new Set<string>(),
}: AggregateStatsInput): TopicStat[] {
  const stats = new Map<string, TopicStat>();

  for (const session of completedSessionsChronologically(sessions)) {
    const entries = buildSessionEntries(
      attemptsBySession.get(session.id) ?? [],
      questionById,
      excludedQuestionIds,
    );
    if (entries.length === 0) {
      continue;
    }

    const questions = entries.map((entry) => entry.question);
    const responses: Record<string, Attempt> = {};
    for (const entry of entries) {
      responses[entry.question.id] = entry.attempt;
    }

    const { topicBreakdown } = scoreSession(questions, responses, session.id);
    const attemptedAt = session.completed_at ?? session.created_at;

    for (const row of topicBreakdown) {
      const existing = stats.get(row.topic);
      stats.set(row.topic, applyTopicBreakdownToStat(existing, row, attemptedAt));
    }
  }

  return [...stats.values()].sort((left, right) =>
    left.topic.localeCompare(right.topic),
  );
}

export interface RichStats {
  /** Subject / programme / paper rollups (see {@link StatDimension}). */
  categories: CategoryStat[];
  /** One summary row per completed session, oldest-first. */
  sessionSummaries: SessionSummary[];
}

/** Maps a paper id to its exam programme. */
function programOf(paper: string | undefined): string {
  const upper = (paper ?? "").toUpperCase();
  if (upper.includes("NSAA")) {
    return "NSAA";
  }
  if (upper.includes("ENGAA")) {
    return "ENGAA";
  }
  return "Other";
}

function trimmedKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** The dimensions folded by {@link aggregateRichStats}, keyed off a question. */
const DIMENSIONS: ReadonlyArray<{
  dimension: StatDimension;
  keyOf: (question: Question) => string | undefined;
  /** Parent programme for a `paper` row; undefined for self-describing dims. */
  programOfKey?: (key: string) => string;
}> = [
  { dimension: "subject", keyOf: (question) => trimmedKey(question.source?.subject) },
  { dimension: "program", keyOf: (question) => programOf(question.source?.paper) },
  {
    dimension: "paper",
    keyOf: (question) => trimmedKey(question.source?.paper),
    programOfKey: (key) => programOf(key),
  },
];

/** Running fold state for one category (accuracy via EWMA + collected times). */
interface CategoryAccumulator {
  stat: TopicStat;
  times: number[];
  program?: string;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Derives the richer Phase 2 aggregates from the attempts store: per-subject,
 * per-programme (NSAA/ENGAA) and per-paper rollups (each with accuracy, EWMA and
 * time-per-question stats), plus one summary row per completed session.
 *
 * Like {@link aggregateTopicStats} this replays completed sessions in
 * chronological order and reuses {@link applyTopicBreakdownToStat} for the EWMA
 * fold, so the accuracy semantics match the topic store exactly. Timing uses
 * only answered (non-skipped) attempts with a positive `time_ms`.
 */
export function aggregateRichStats({
  sessions,
  attemptsBySession,
  questionById,
  excludedQuestionIds = new Set<string>(),
}: AggregateStatsInput): RichStats {
  // dimension -> key -> accumulator
  const byDimension = new Map<StatDimension, Map<string, CategoryAccumulator>>();
  for (const { dimension } of DIMENSIONS) {
    byDimension.set(dimension, new Map());
  }
  const sessionSummaries: SessionSummary[] = [];

  for (const session of completedSessionsChronologically(sessions)) {
    const entries = buildSessionEntries(
      attemptsBySession.get(session.id) ?? [],
      questionById,
      excludedQuestionIds,
    );
    if (entries.length === 0) {
      continue;
    }

    const attemptedAt = session.completed_at ?? session.created_at;

    // Per-session totals for the history series.
    let answered = 0;
    let correct = 0;
    let skipped = 0;
    const sessionTimes: number[] = [];

    // Per-dimension breakdown for this session, folded into the running stats.
    for (const { dimension, keyOf, programOfKey } of DIMENSIONS) {
      const accumulators = byDimension.get(dimension)!;
      const breakdown = new Map<
        string,
        { correct: number; total: number; times: number[] }
      >();

      for (const { question, attempt } of entries) {
        const result = normalizeResult(attempt.result);
        if (result === "skipped") {
          continue;
        }
        const key = keyOf(question);
        if (key === undefined) {
          continue;
        }
        const row = breakdown.get(key) ?? { correct: 0, total: 0, times: [] };
        row.total += 1;
        if (result === "correct") {
          row.correct += 1;
        }
        if (typeof attempt.time_ms === "number" && attempt.time_ms > 0) {
          row.times.push(attempt.time_ms);
        }
        breakdown.set(key, row);
      }

      for (const [key, row] of breakdown) {
        const existing = accumulators.get(key);
        const stat = applyTopicBreakdownToStat(
          existing?.stat,
          {
            topic: key,
            correct: row.correct,
            total: row.total,
            accuracy: row.total > 0 ? row.correct / row.total : 0,
          },
          attemptedAt,
        );
        const accumulator: CategoryAccumulator = existing ?? {
          stat,
          times: [],
          program: programOfKey ? programOfKey(key) : undefined,
        };
        accumulator.stat = stat;
        accumulator.times.push(...row.times);
        accumulators.set(key, accumulator);
      }
    }

    // Session summary uses every answered attempt regardless of dimension.
    for (const { attempt } of entries) {
      const result = normalizeResult(attempt.result);
      if (result === "skipped") {
        skipped += 1;
        continue;
      }
      answered += 1;
      if (result === "correct") {
        correct += 1;
      }
      if (typeof attempt.time_ms === "number" && attempt.time_ms > 0) {
        sessionTimes.push(attempt.time_ms);
      }
    }

    const sessionTotalTime = sum(sessionTimes);
    sessionSummaries.push({
      session_id: session.id,
      mode: session.mode,
      completed_at: attemptedAt,
      attempts: answered,
      correct,
      skipped,
      accuracy: answered > 0 ? correct / answered : 0,
      total_time_ms: sessionTotalTime,
      avg_time_ms: sessionTimes.length > 0 ? sessionTotalTime / sessionTimes.length : 0,
      median_time_ms: median(sessionTimes),
    });
  }

  const categories: CategoryStat[] = [];
  for (const { dimension } of DIMENSIONS) {
    const accumulators = byDimension.get(dimension)!;
    for (const [key, accumulator] of accumulators) {
      const totalTime = sum(accumulator.times);
      categories.push({
        id: `${dimension}::${key}`,
        dimension,
        key,
        ...(accumulator.program ? { program: accumulator.program } : {}),
        attempts: accumulator.stat.attempts,
        correct: accumulator.stat.correct,
        accuracy: accumulator.stat.accuracy,
        ewma_accuracy: accumulator.stat.ewma_accuracy,
        last_attempted: accumulator.stat.last_attempted,
        total_time_ms: totalTime,
        timed_attempts: accumulator.times.length,
        avg_time_ms:
          accumulator.times.length > 0 ? totalTime / accumulator.times.length : 0,
        median_time_ms: median(accumulator.times),
      });
    }
  }

  categories.sort((left, right) => {
    if (left.dimension !== right.dimension) {
      return left.dimension.localeCompare(right.dimension);
    }
    return left.key.localeCompare(right.key);
  });

  return { categories, sessionSummaries };
}
