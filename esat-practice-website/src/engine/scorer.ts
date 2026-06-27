import type { ScoringResult, TopicBreakdownRow } from "../types/engine";
import type { Attempt, Question } from "../types/schema";
import { generateId } from "../lib/ids";
import { normalizeResult } from "./result";

function sortTopics(rows: TopicBreakdownRow[]): TopicBreakdownRow[] {
  return [...rows].sort((left, right) => {
    if (left.accuracy !== right.accuracy) {
      return left.accuracy - right.accuracy;
    }
    return left.topic.localeCompare(right.topic);
  });
}

export function scoreSession(
  questions: Question[],
  responses: Record<string, Attempt>,
  sessionId: string,
): ScoringResult {
  const topicMap = new Map<string, { correct: number; total: number }>();
  const timestamp = Date.now();

  const attempts = questions.map((question) => {
    const response = responses[question.id];
    const result = normalizeResult(response?.result);
    const isCorrect = result === "correct";

    if (result !== "skipped") {
      const key = question.taxonomy.primary_topic;
      const existing = topicMap.get(key) ?? { correct: 0, total: 0 };
      existing.total += 1;
      if (isCorrect) {
        existing.correct += 1;
      }
      topicMap.set(key, existing);
    }

    return {
      id: response?.id ?? generateId(),
      question_id: question.id,
      session_id: sessionId,
      result,
      time_ms: response?.time_ms ?? 0,
      flagged: response?.flagged ?? false,
      timestamp: response?.timestamp ?? timestamp,
    };
  });

  const topicBreakdown = sortTopics(
    [...topicMap.entries()].map(([topic, stat]) => ({
      topic,
      correct: stat.correct,
      total: stat.total,
      accuracy: stat.correct / stat.total,
    })),
  );

  return {
    attempts,
    topicBreakdown,
  };
}
