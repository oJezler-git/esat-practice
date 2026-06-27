import { describe, it, expect } from "vitest";
import { aggregateRichStats, aggregateTopicStats } from "./statsAggregator";
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

function makeRichQuestion(
  id: string,
  topic: string,
  subject: string,
  paper: string,
): Question {
  return {
    id,
    source: { subject, paper, year: 2016, part: "Part A", page: 1 },
    taxonomy: { primary_topic: topic },
  } as unknown as Question;
}

function makeTimedAttempt(
  sessionId: string,
  questionId: string,
  result: Attempt["result"],
  timeMs: number,
): Attempt {
  return {
    id: `${sessionId}-${questionId}`,
    question_id: questionId,
    session_id: sessionId,
    result,
    time_ms: timeMs,
    flagged: false,
    timestamp: 0,
  };
}

describe("aggregateRichStats", () => {
  const richQuestions = new Map<string, Question>([
    ["q1", makeRichQuestion("q1", "M4. Algebra", "Mathematics", "NSAA_2016_S1.pdf")],
    ["q2", makeRichQuestion("q2", "P1. Mechanics", "Physics", "NSAA_2016_S1.pdf")],
    ["q3", makeRichQuestion("q3", "M4. Algebra", "Mathematics", "ENGAA_2017_S1.pdf")],
  ]);

  it("rolls up by subject, programme and paper with accuracy and timing", () => {
    const sessions = [makeSession("s1", 100)];
    const attemptsBySession = new Map<string, Attempt[]>([
      [
        "s1",
        [
          makeTimedAttempt("s1", "q1", "correct", 1000),
          makeTimedAttempt("s1", "q2", "incorrect", 3000),
          makeTimedAttempt("s1", "q3", "correct", 2000),
        ],
      ],
    ]);

    const { categories } = aggregateRichStats({
      sessions,
      attemptsBySession,
      questionById: richQuestions,
    });

    const subject = categories.find((c) => c.id === "subject::Mathematics");
    expect(subject).toMatchObject({
      dimension: "subject",
      key: "Mathematics",
      attempts: 2,
      correct: 2,
      accuracy: 1,
    });
    // q1 (1000) + q3 (2000) → avg 1500, median 1500.
    expect(subject?.avg_time_ms).toBe(1500);
    expect(subject?.median_time_ms).toBe(1500);
    expect(subject?.timed_attempts).toBe(2);

    const nsaa = categories.find((c) => c.id === "program::NSAA");
    expect(nsaa).toMatchObject({ dimension: "program", attempts: 2, correct: 1 });

    const engaa = categories.find((c) => c.id === "program::ENGAA");
    expect(engaa).toMatchObject({ dimension: "program", attempts: 1, correct: 1 });

    const paper = categories.find((c) => c.id === "paper::NSAA_2016_S1.pdf");
    expect(paper).toMatchObject({
      dimension: "paper",
      program: "NSAA",
      attempts: 2,
      correct: 1,
    });
  });

  it("produces one session summary per completed session", () => {
    const sessions = [makeSession("s1", 100), makeSession("s2", 200, "abandoned")];
    const attemptsBySession = new Map<string, Attempt[]>([
      [
        "s1",
        [
          makeTimedAttempt("s1", "q1", "correct", 1000),
          makeTimedAttempt("s1", "q2", "skipped", 0),
          makeTimedAttempt("s1", "q3", "incorrect", 3000),
        ],
      ],
      ["s2", [makeTimedAttempt("s2", "q1", "correct", 5000)]],
    ]);

    const { sessionSummaries } = aggregateRichStats({
      sessions,
      attemptsBySession,
      questionById: richQuestions,
    });

    expect(sessionSummaries).toHaveLength(1);
    expect(sessionSummaries[0]).toMatchObject({
      session_id: "s1",
      attempts: 2,
      correct: 1,
      skipped: 1,
      accuracy: 0.5,
      total_time_ms: 4000,
      avg_time_ms: 2000,
      median_time_ms: 2000,
    });
  });

  it("is idempotent and filters excluded/deleted questions", () => {
    const sessions = [makeSession("s1", 100)];
    const attemptsBySession = new Map<string, Attempt[]>([
      [
        "s1",
        [
          makeTimedAttempt("s1", "q1", "correct", 1000),
          makeTimedAttempt("s1", "q2", "correct", 1000),
          makeTimedAttempt("s1", "ghost", "correct", 1000),
        ],
      ],
    ]);
    const excludedQuestionIds = new Set(["q2"]);

    const first = aggregateRichStats({
      sessions,
      attemptsBySession,
      questionById: richQuestions,
      excludedQuestionIds,
    });
    const second = aggregateRichStats({
      sessions,
      attemptsBySession,
      questionById: richQuestions,
      excludedQuestionIds,
    });

    expect(first).toEqual(second);
    // Only q1 (Mathematics) survives; q2 excluded, ghost missing.
    const subject = first.categories.find((c) => c.id === "subject::Mathematics");
    expect(subject).toMatchObject({ attempts: 1, correct: 1 });
    expect(first.categories.find((c) => c.id === "subject::Physics")).toBeUndefined();
  });
});
