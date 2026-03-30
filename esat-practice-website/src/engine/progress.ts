import type { TopicBreakdownRow } from "../types/engine";
import type { TopicStat } from "../types/schema";

export const DEFAULT_EWMA_ALPHA = 0.3;

export function applyTopicBreakdownToStat(
  existing: TopicStat | undefined,
  row: TopicBreakdownRow,
  attemptedAt: number,
  alpha: number = DEFAULT_EWMA_ALPHA,
): TopicStat {
  const latestAccuracy = row.total > 0 ? row.correct / row.total : 0;
  const previousEwma = existing?.ewma_accuracy ?? latestAccuracy;
  const attempts = (existing?.attempts ?? 0) + row.total;
  const correct = (existing?.correct ?? 0) + row.correct;

  return {
    topic: row.topic,
    attempts,
    correct,
    accuracy: attempts > 0 ? correct / attempts : 0,
    ewma_accuracy: alpha * latestAccuracy + (1 - alpha) * previousEwma,
    last_attempted: attemptedAt,
  };
}
