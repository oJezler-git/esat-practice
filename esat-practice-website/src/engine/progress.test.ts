import { describe, it, expect } from "vitest";
import { applyTopicBreakdownToStat } from "./progress";
import type { TopicStat } from "../types/schema";
import type { TopicBreakdownRow } from "../types/engine";

describe("progress", () => {
  const mockRow: TopicBreakdownRow = {
    topic: "Math",
    correct: 2,
    total: 2,
    accuracy: 1,
  };

  it("should create new stat if existing is undefined", () => {
    const result = applyTopicBreakdownToStat(undefined, mockRow, 1000);
    expect(result).toEqual({
      topic: "Math",
      attempts: 2,
      correct: 2,
      accuracy: 1,
      ewma_accuracy: 1,
      last_attempted: 1000,
    });
  });

  it("should update existing stat with EWMA", () => {
    const existing: TopicStat = {
      topic: "Math",
      attempts: 10,
      correct: 5,
      accuracy: 0.5,
      ewma_accuracy: 0.5,
      last_attempted: 500,
    };

    const newRow: TopicBreakdownRow = {
      topic: "Math",
      correct: 0,
      total: 1,
      accuracy: 0,
    };

    // alpha = 0.3
    // ewma = 0.3 * 0 + (1 - 0.3) * 0.5 = 0.7 * 0.5 = 0.35
    const result = applyTopicBreakdownToStat(existing, newRow, 1000, 0.3);

    expect(result.attempts).toBe(11);
    expect(result.correct).toBe(5);
    expect(result.accuracy).toBe(5 / 11);
    expect(result.ewma_accuracy).toBeCloseTo(0.35);
    expect(result.last_attempted).toBe(1000);
  });

  it("should handle zero totals in row", () => {
    const newRow: TopicBreakdownRow = {
        topic: "Math",
        correct: 0,
        total: 0,
        accuracy: 0,
    };
    const result = applyTopicBreakdownToStat(undefined, newRow, 1000);
    expect(result.accuracy).toBe(0);
    expect(result.ewma_accuracy).toBe(0);
  });
});
