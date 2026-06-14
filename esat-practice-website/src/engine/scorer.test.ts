import { describe, it, expect } from "vitest";
import { scoreSession } from "./scorer";
import type { Question } from "../types/schema";
import type { Attempt } from "../types/schema";

describe("scorer", () => {
  const mockQuestions: Question[] = [
    {
      id: "q1",
      taxonomy: { primary_topic: "Math" },
      content: { text: "1+1" },
      answer: { correct: "A", choices: { A: "2" } },
    } as any,
    {
      id: "q2",
      taxonomy: { primary_topic: "Physics" },
      content: { text: "F=ma" },
      answer: { correct: "B", choices: { B: "Force" } },
    } as any,
    {
      id: "q3",
      taxonomy: { primary_topic: "Math" },
      content: { text: "2+2" },
      answer: { correct: "C", choices: { C: "4" } },
    } as any,
  ];

  it("should calculate correct topic breakdown", () => {
    const responses: Record<string, Attempt> = {
      q1: { id: "a1", result: "correct", time_ms: 100 } as any,
      q2: { id: "a2", result: "incorrect", time_ms: 200 } as any,
      q3: { id: "a3", result: "correct", time_ms: 300 } as any,
    };

    const result = scoreSession(mockQuestions, responses, "session-1");

    expect(result.topicBreakdown).toHaveLength(2);
    expect(result.topicBreakdown[0]).toMatchObject({ topic: "Physics", correct: 0, total: 1 });
    expect(result.topicBreakdown[0].accuracy).toBeCloseTo(0);
    expect(result.topicBreakdown[1]).toMatchObject({ topic: "Math", correct: 2, total: 2 });
    expect(result.topicBreakdown[1].accuracy).toBeCloseTo(1);
  });

  it("should handle skipped questions in breakdown", () => {
    const responses: Record<string, Attempt> = {
      q1: { id: "a1", result: "correct", time_ms: 100 } as any,
      q2: { id: "a2", result: "skipped", time_ms: 200 } as any,
    };

    const result = scoreSession(mockQuestions, responses, "session-1");

    // q2 skipped, so only Math should be in breakdown
    expect(result.topicBreakdown).toEqual([
      { topic: "Math", correct: 1, total: 1, accuracy: 1 },
    ]);
  });

  it("should generate attempts for all questions", () => {
    const responses: Record<string, Attempt> = {
      q1: { id: "a1", result: "correct", time_ms: 100 } as any,
    };

    const result = scoreSession(mockQuestions, responses, "session-1");

    expect(result.attempts.length).toBe(3);
    expect(result.attempts.find(a => a.question_id === "q1")?.result).toBe("correct");
    expect(result.attempts.find(a => a.question_id === "q2")?.result).toBe("skipped");
  });

  it("should handle invalid result values by defaulting to skipped", () => {
    const responses: Record<string, Attempt> = {
      q1: { id: "a1", result: "garbage" as any, time_ms: 100 } as any,
    };

    const result = scoreSession(mockQuestions, responses, "session-1");
    expect(result.attempts[0].result).toBe("skipped");
  });

  it("should handle empty question list", () => {
    const result = scoreSession([], {}, "session-1");
    expect(result.attempts).toHaveLength(0);
    expect(result.topicBreakdown).toHaveLength(0);
  });

  it("should handle missing responses by generating skipped attempts", () => {
    const result = scoreSession(mockQuestions, {}, "session-1");
    expect(result.attempts).toHaveLength(3);
    result.attempts.forEach(attempt => {
      expect(attempt.result).toBe("skipped");
    });
    expect(result.topicBreakdown).toHaveLength(0);
  });
});
