import { aggregateRichStats, aggregateTopicStats } from "../engine/statsAggregator";
import type {
  Attempt,
  CategoryStat,
  SessionSummary,
  StatDimension,
  TopicStat,
} from "../types/schema";
import { getDb } from "./db";
import { normalizeAttemptRecord } from "./sessionStore";

export async function getTopicStats(): Promise<TopicStat[]> {
  const database = await getDb();
  const rows = await database.getAll("stats");
  return rows.sort((left, right) => left.topic.localeCompare(right.topic));
}

export async function getAllStats(): Promise<TopicStat[]> {
  return getTopicStats();
}

export async function getTopicStat(topic: string): Promise<TopicStat | null> {
  const database = await getDb();
  const stat = await database.get("stats", topic);
  return stat ?? null;
}

export async function upsertTopicStat(stat: TopicStat): Promise<void> {
  const database = await getDb();
  await database.put("stats", stat);
}

/**
 * Per-category (subject / programme / paper) rollups, optionally filtered to a
 * single {@link StatDimension}. Sorted weakest-first by EWMA accuracy.
 */
export async function getCategoryStats(
  dimension?: StatDimension,
): Promise<CategoryStat[]> {
  const database = await getDb();
  const rows = dimension
    ? await database.getAllFromIndex("categoryStats", "by-dimension", dimension)
    : await database.getAll("categoryStats");
  return rows.sort((left, right) => left.ewma_accuracy - right.ewma_accuracy);
}

/** Per-session history series, most recently completed first. */
export async function getSessionSummaries(): Promise<SessionSummary[]> {
  const database = await getDb();
  const rows = await database.getAll("sessionSummaries");
  return rows.sort((left, right) => right.completed_at - left.completed_at);
}

/**
 * Rebuilds every derived stats store (`stats`, `categoryStats`,
 * `sessionSummaries`) from the attempts store (the single source of truth) in
 * one transaction. Idempotent: deriving from source means repeated calls — and
 * the double-submit case — can never double-count. Safe to run on every app
 * start.
 */
export async function recomputeAllStats(): Promise<void> {
  const database = await getDb();
  const [sessions, rawAttempts, questions, excluded] = await Promise.all([
    database.getAll("sessions"),
    database.getAll("attempts"),
    database.getAll("questions"),
    database.getAll("excludedQuestions"),
  ]);

  const attemptsBySession = new Map<string, Attempt[]>();
  for (const raw of rawAttempts) {
    const attempt = normalizeAttemptRecord(raw);
    if (!attempt) {
      continue;
    }
    const existing = attemptsBySession.get(attempt.session_id);
    if (existing) {
      existing.push(attempt);
    } else {
      attemptsBySession.set(attempt.session_id, [attempt]);
    }
  }

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const excludedQuestionIds = new Set(excluded.map((entry) => entry.question_id));
  const input = {
    sessions,
    attemptsBySession,
    questionById,
    excludedQuestionIds,
  };

  const topicStats = aggregateTopicStats(input);
  const { categories, sessionSummaries } = aggregateRichStats(input);

  const tx = database.transaction(
    ["stats", "categoryStats", "sessionSummaries"],
    "readwrite",
  );
  const statsStore = tx.objectStore("stats");
  const categoryStore = tx.objectStore("categoryStats");
  const summaryStore = tx.objectStore("sessionSummaries");

  await Promise.all([
    statsStore.clear(),
    categoryStore.clear(),
    summaryStore.clear(),
  ]);
  await Promise.all([
    ...topicStats.map((stat) => statsStore.put(stat)),
    ...categories.map((stat) => categoryStore.put(stat)),
    ...sessionSummaries.map((summary) => summaryStore.put(summary)),
  ]);
  await tx.done;
}

const statsStoreApi = {
  getAllStats,
  getTopicStats,
  getTopicStat,
  upsertTopicStat,
  getCategoryStats,
  getSessionSummaries,
  recomputeAllStats,
};

export function useStatsStore() {
  return statsStoreApi;
}
