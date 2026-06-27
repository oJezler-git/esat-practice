import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getTopicStats,
  getTopicStat,
  upsertTopicStat,
  recomputeAllStats,
} from "./statsStore";
import { getDb } from "./db";
import {
  aggregateRichStats,
  aggregateTopicStats,
} from "../engine/statsAggregator";

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
    const stores: Record<string, { clear: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> }> = {};
    const objectStore = vi.fn((name: string) => {
      if (!stores[name]) {
        stores[name] = {
          clear: vi.fn().mockResolvedValue(undefined),
          put: vi.fn().mockResolvedValue(undefined),
        };
      }
      return stores[name];
    });
    const db = {
      getAll: vi.fn((storeName: string) =>
        Promise.resolve((data as Record<string, unknown[]>)[storeName] ?? []),
      ),
      transaction: vi.fn().mockReturnValue({
        objectStore,
        done: Promise.resolve(),
      }),
    };
    return { db, stores };
  }

  it("aggregates from all source stores and replaces the derived stores", async () => {
    const sessions = [{ id: "s1", state: "completed" }];
    const attempts = [
      { id: "a1", question_id: "q1", session_id: "s1", result: "correct" },
    ];
    const questions = [{ id: "q1", taxonomy: { primary_topic: "Math" } }];
    const excludedQuestions = [{ question_id: "qX" }];
    const { db, stores } = createRecomputeDb({
      sessions,
      attempts,
      questions,
      excludedQuestions,
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const derivedTopics = [makeStat({ topic: "Math" })];
    const derivedCategory = { id: "subject::Mathematics", dimension: "subject" };
    const derivedSummary = { session_id: "s1", correct: 1 };
    vi.mocked(aggregateTopicStats).mockReturnValue(derivedTopics as any);
    vi.mocked(aggregateRichStats).mockReturnValue({
      categories: [derivedCategory],
      sessionSummaries: [derivedSummary],
    } as any);

    await recomputeAllStats();

    // Source stores are read.
    expect(db.getAll).toHaveBeenCalledWith("sessions");
    expect(db.getAll).toHaveBeenCalledWith("attempts");
    expect(db.getAll).toHaveBeenCalledWith("questions");
    expect(db.getAll).toHaveBeenCalledWith("excludedQuestions");

    // Both aggregators receive grouped attempts, question map and excluded set.
    const input = vi.mocked(aggregateTopicStats).mock.calls[0][0];
    expect(input.sessions).toEqual(sessions);
    expect(input.attemptsBySession.get("s1")).toHaveLength(1);
    expect(input.questionById.get("q1")).toBeTruthy();
    expect(input.excludedQuestionIds?.has("qX")).toBe(true);
    expect(vi.mocked(aggregateRichStats).mock.calls[0][0]).toBe(input);

    // Every derived store is cleared then repopulated with its aggregate.
    expect(stores.stats.clear).toHaveBeenCalledTimes(1);
    expect(stores.stats.put).toHaveBeenCalledWith(derivedTopics[0]);
    expect(stores.categoryStats.clear).toHaveBeenCalledTimes(1);
    expect(stores.categoryStats.put).toHaveBeenCalledWith(derivedCategory);
    expect(stores.sessionSummaries.clear).toHaveBeenCalledTimes(1);
    expect(stores.sessionSummaries.put).toHaveBeenCalledWith(derivedSummary);
  });
});
