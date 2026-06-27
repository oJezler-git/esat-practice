import { aggregateTopicStats } from "../engine/statsAggregator";
import type { Attempt, TopicStat } from "../types/schema";
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
 * Rebuilds the entire `stats` store from the attempts store (the single source
 * of truth). Idempotent: deriving from source means repeated calls — and the
 * double-submit case — can never double-count. Safe to run on every app start.
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

  const nextStats = aggregateTopicStats({
    sessions,
    attemptsBySession,
    questionById,
    excludedQuestionIds,
  });

  const tx = database.transaction("stats", "readwrite");
  await tx.store.clear();
  for (const stat of nextStats) {
    await tx.store.put(stat);
  }
  await tx.done;
}

const statsStoreApi = {
  getAllStats,
  getTopicStats,
  getTopicStat,
  upsertTopicStat,
  recomputeAllStats,
};

export function useStatsStore() {
  return statsStoreApi;
}
