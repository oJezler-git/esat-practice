import { describe, it, expect } from "vitest";
import { aggregateTopicStats } from "./statsAggregator";
import { applyTopicBreakdownToStat } from "./progress";
import type { Attempt, Question, Session } from "../types/schema";

function makeQuestion(id: string, topic: string): Question {
  return {
    id,
    taxonomy: { primary_topic: topic },
  } as unknown as Question;
}

function makeAttempt(
  sessionId: string,
  questionId: string,
  result: Attempt["result"],
): Attempt {
  return {
    id: `${sessionId}-${questionId}`,
    question_id: questionId,
    session_id: sessionId,
    result,
    time_ms: 1000,
    flagged: false,
    timestamp: 0,
  };
}

function makeSession(
  id: string,
  completedAt: number,
  state: Session["state"] = "completed",
): Session {
  return {
    id,
    created_at: completedAt - 1000,
    completed_at: completedAt,
    mode: "untimed",
    config: { question_ids: [] },
    attempt_ids: [],
    state,
  };
}

const questionById = new Map<string, Question>([
  ["q1", makeQuestion("q1", "Math")],
  ["q2", makeQuestion("q2", "Physics")],
  ["q3", makeQuestion("q3", "Math")],
]);

describe("aggregateTopicStats", () => {
  it("derives per-topic cumulative accuracy from completed sessions", () => {
    const sessions = [makeSession("s1", 100)];
    const attemptsBySession = new Map<string, Attempt[]>([
      [
        "s1",
        [
          makeAttempt("s1", "q1", "correct"),
          makeAttempt("s1", "q2", "incorrect"),
          makeAttempt("s1", "q3", "correct"),
        ],
      ],
    ]);

    const stats = aggregateTopicStats({ sessions, attemptsBySession, questionById });

    expect(stats.map((stat) => stat.topic)).toEqual(["Math", "Physics"]);
    const math = stats.find((stat) => stat.topic === "Math");
    expect(math).toMatchObject({ attempts: 2, correct: 2, accuracy: 1 });
    expect(math?.last_attempted).toBe(100);
    const physics = stats.find((stat) => stat.topic === "Physics");
    expect(physics).toMatchObject({ attempts: 1, correct: 0, accuracy: 0 });
  });

  it("ignores skipped attempts (they do not affect accuracy)", () => {
    const sessions = [makeSession("s1", 100)];
    const attemptsBySession = new Map<string, Attempt[]>([
      ["s1", [makeAttempt("s1", "q1", "correct"), makeAttempt("s1", "q2", "skipped")]],
    ]);

    const stats = aggregateTopicStats({ sessions, attemptsBySession, questionById });

    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ topic: "Math", attempts: 1, correct: 1 });
  });

  it("excludes hidden questions and missing/deleted questions", () => {
    const sessions = [makeSession("s1", 100)];
    const attemptsBySession = new Map<string, Attempt[]>([
      [
        "s1",
        [
          makeAttempt("s1", "q1", "correct"),
          makeAttempt("s1", "q2", "correct"),
          makeAttempt("s1", "ghost", "correct"), // not in questionById
        ],
      ],
    ]);
    const excludedQuestionIds = new Set(["q2"]);

    const stats = aggregateTopicStats({
      sessions,
      attemptsBySession,
      questionById,
      excludedQuestionIds,
    });

    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ topic: "Math", attempts: 1, correct: 1 });
  });

  it("only counts completed sessions", () => {
    const sessions = [
      makeSession("s1", 100, "abandoned"),
      makeSession("s2", 200, "active"),
    ];
    const attemptsBySession = new Map<string, Attempt[]>([
      ["s1", [makeAttempt("s1", "q1", "correct")]],
      ["s2", [makeAttempt("s2", "q1", "correct")]],
    ]);

    const stats = aggregateTopicStats({ sessions, attemptsBySession, questionById });
    expect(stats).toEqual([]);
  });

  it("is idempotent and order-independent (sorts sessions chronologically)", () => {
    const sessions = [makeSession("s2", 200), makeSession("s1", 100)];
    const attemptsBySession = new Map<string, Attempt[]>([
      ["s1", [makeAttempt("s1", "q1", "correct")]],
      ["s2", [makeAttempt("s2", "q1", "incorrect")]],
    ]);

    const first = aggregateTopicStats({ sessions, attemptsBySession, questionById });
    const second = aggregateTopicStats({
      sessions: [...sessions].reverse(),
      attemptsBySession,
      questionById,
    });

    expect(first).toEqual(second);

    // EWMA must equal a manual chronological replay: s1 (acc 1) then s2 (acc 0).
    const replay = applyTopicBreakdownToStat(
      applyTopicBreakdownToStat(
        undefined,
        { topic: "Math", correct: 1, total: 1, accuracy: 1 },
        100,
      ),
      { topic: "Math", correct: 0, total: 1, accuracy: 0 },
      200,
    );
    expect(first[0].ewma_accuracy).toBeCloseTo(replay.ewma_accuracy);
    expect(first[0]).toMatchObject({ attempts: 2, correct: 1 });
  });
});
