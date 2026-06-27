import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getTopicStats,
  getTopicStat,
  upsertTopicStat,
  recomputeAllStats,
} from "./statsStore";
import { getDb } from "./db";
import { aggregateTopicStats } from "../engine/statsAggregator";

vi.mock("./db");
vi.mock("../engine/statsAggregator");

function makeStat(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Algebra",
    attempts: 10,
    correct: 7,
    accuracy: 0.7,
    ewma_accuracy: 0.7,
    last_attempted: 1_700_000_000,
    ...overrides,
  };
}

function createMockDb(opts: { stats?: unknown[]; stat?: unknown } = {}) {
  const storeInTx = {
    get: vi.fn().mockResolvedValue(opts.stat ?? null),
    put: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
  const db = {
    getAll: vi.fn().mockResolvedValue(opts.stats ?? []),
    get: vi.fn().mockResolvedValue(opts.stat ?? null),
    put: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn().mockReturnValue({
      store: storeInTx,
      done: Promise.resolve(),
    }),
  };
  return { db, storeInTx };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getTopicStats", () => {
  it("returns stats sorted alphabetically by topic", async () => {
    const stats = [
      makeStat({ topic: "Physics" }),
      makeStat({ topic: "Algebra" }),
      makeStat({ topic: "Calculus" }),
    ];
    const { db } = createMockDb({ stats });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await getTopicStats();
    expect(result.map((s) => s.topic)).toEqual(["Algebra", "Calculus", "Physics"]);
  });

  it("returns an empty array when no stats exist", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    expect(await getTopicStats()).toEqual([]);
  });
});

describe("getTopicStat", () => {
  it("returns the stat for a known topic", async () => {
    const stat = makeStat({ topic: "Calculus" });
    const { db } = createMockDb({ stat });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await getTopicStat("Calculus");
    expect(result).toEqual(stat);
    expect(db.get).toHaveBeenCalledWith("stats", "Calculus");
  });

  it("returns null for an unknown topic", async () => {
    const { db } = createMockDb({ stat: undefined });
    vi.mocked(getDb).mockResolvedValue(db as any);
    expect(await getTopicStat("Unknown")).toBeNull();
  });
});

describe("upsertTopicStat", () => {
  it("writes the stat to the store", async () => {
    const stat = makeStat();
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);

    await upsertTopicStat(stat as any);

    expect(db.put).toHaveBeenCalledWith("stats", stat);
  });
});

describe("recomputeAllStats", () => {
  function createRecomputeDb(data: {
    sessions?: unknown[];
    attempts?: unknown[];
    questions?: unknown[];
    excludedQuestions?: unknown[];
  }) {
    const storeInTx = {
      clear: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    const db = {
      getAll: vi.fn((storeName: string) =>
        Promise.resolve((data as Record<string, unknown[]>)[storeName] ?? []),
      ),
      transaction: vi.fn().mockReturnValue({
        store: storeInTx,
        done: Promise.resolve(),
      }),
    };
    return { db, storeInTx };
  }

  it("aggregates from all source stores and replaces the stats store", async () => {
    const sessions = [{ id: "s1", state: "completed" }];
    const attempts = [
      { id: "a1", question_id: "q1", session_id: "s1", result: "correct" },
    ];
    const questions = [{ id: "q1", taxonomy: { primary_topic: "Math" } }];
    const excludedQuestions = [{ question_id: "qX" }];
    const { db, storeInTx } = createRecomputeDb({
      sessions,
      attempts,
      questions,
      excludedQuestions,
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const derived = [makeStat({ topic: "Math" })];
    vi.mocked(aggregateTopicStats).mockReturnValue(derived as any);

    await recomputeAllStats();

    // Source stores are read.
    expect(db.getAll).toHaveBeenCalledWith("sessions");
    expect(db.getAll).toHaveBeenCalledWith("attempts");
    expect(db.getAll).toHaveBeenCalledWith("questions");
    expect(db.getAll).toHaveBeenCalledWith("excludedQuestions");

    // Aggregator receives grouped attempts, question map and excluded set.
    const input = vi.mocked(aggregateTopicStats).mock.calls[0][0];
    expect(input.sessions).toEqual(sessions);
    expect(input.attemptsBySession.get("s1")).toHaveLength(1);
    expect(input.questionById.get("q1")).toBeTruthy();
    expect(input.excludedQuestionIds?.has("qX")).toBe(true);

    // Stats store is cleared then repopulated with the derived stats.
    expect(storeInTx.clear).toHaveBeenCalledTimes(1);
    expect(storeInTx.put).toHaveBeenCalledWith(derived[0]);
  });
});
