import { applyTopicBreakdownToStat } from "../engine/progress";
import type { TopicBreakdownRow } from "../types/engine";
import type { TopicStat } from "../types/schema";
import { getDb } from "./db";

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

export async function updateTopicStatsFromBreakdown(
  topicRows: TopicBreakdownRow[],
  attemptedAt: number = Date.now(),
): Promise<void> {
  const database = await getDb();
  const tx = database.transaction("stats", "readwrite");

  for (const row of topicRows) {
    if (row.total <= 0) {
      continue;
    }

    const existing = await tx.store.get(row.topic);
    const next = applyTopicBreakdownToStat(existing ?? undefined, row, attemptedAt);

    await tx.store.put(next);
  }

  await tx.done;
}

const statsStoreApi = {
  getAllStats,
  getTopicStats,
  getTopicStat,
  upsertTopicStat,
  updateTopicStatsFromBreakdown,
};

export function useStatsStore() {
  return statsStoreApi;
}
