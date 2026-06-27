import type { Attempt, Question, Session, TopicStat } from "../types/schema";
import { scoreSession } from "./scorer";
import { applyTopicBreakdownToStat } from "./progress";

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
  const completedInOrder = sessions
    .filter((session) => session.state === "completed")
    .sort(
      (left, right) =>
        (left.completed_at ?? left.created_at) -
        (right.completed_at ?? right.created_at),
    );

  const stats = new Map<string, TopicStat>();

  for (const session of completedInOrder) {
    const attempts = attemptsBySession.get(session.id) ?? [];

    const questions: Question[] = [];
    const responses: Record<string, Attempt> = {};
    for (const attempt of attempts) {
      if (excludedQuestionIds.has(attempt.question_id)) {
        continue;
      }
      const question = questionById.get(attempt.question_id);
      if (!question) {
        continue;
      }
      // Guard against duplicate attempt rows for the same question within a
      // session: count each question once (latest attempt wins for the result).
      if (!(attempt.question_id in responses)) {
        questions.push(question);
      }
      responses[attempt.question_id] = attempt;
    }

    if (questions.length === 0) {
      continue;
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
