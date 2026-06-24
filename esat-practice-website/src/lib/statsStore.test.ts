import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getTopicStats,
  getTopicStat,
  upsertTopicStat,
  updateTopicStatsFromBreakdown,
} from "./statsStore";
import { getDb } from "./db";
import { applyTopicBreakdownToStat } from "../engine/progress";

vi.mock("./db");
vi.mock("../engine/progress");

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

describe("updateTopicStatsFromBreakdown", () => {
  it("skips rows where total is 0", async () => {
    const { db, storeInTx } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);

    await updateTopicStatsFromBreakdown([{ topic: "Algebra", total: 0, correct: 0 }]);

    expect(storeInTx.get).not.toHaveBeenCalled();
    expect(storeInTx.put).not.toHaveBeenCalled();
  });

  it("skips rows where total is negative", async () => {
    const { db, storeInTx } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);

    await updateTopicStatsFromBreakdown([{ topic: "Algebra", total: -1, correct: 0 }]);

    expect(storeInTx.put).not.toHaveBeenCalled();
  });

  it("reads existing stat and upserts the result of applyTopicBreakdownToStat", async () => {
    const existingStat = makeStat({ topic: "Algebra" });
    const nextStat = makeStat({ topic: "Algebra", attempts: 13 });
    const { db, storeInTx } = createMockDb({ stat: existingStat });
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(applyTopicBreakdownToStat).mockReturnValue(nextStat as any);

    const row = { topic: "Algebra", total: 3, correct: 2 };
    await updateTopicStatsFromBreakdown([row], 1_234_567_890);

    expect(storeInTx.get).toHaveBeenCalledWith("Algebra");
    expect(applyTopicBreakdownToStat).toHaveBeenCalledWith(existingStat, row, 1_234_567_890);
    expect(storeInTx.put).toHaveBeenCalledWith(nextStat);
  });

  it("passes undefined to applyTopicBreakdownToStat when no existing stat exists", async () => {
    const nextStat = makeStat();
    const { db } = createMockDb({ stat: null });
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(applyTopicBreakdownToStat).mockReturnValue(nextStat as any);

    await updateTopicStatsFromBreakdown([{ topic: "Algebra", total: 2, correct: 1 }], 100);

    expect(applyTopicBreakdownToStat).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ topic: "Algebra" }),
      100,
    );
  });

  it("processes multiple rows in a single transaction", async () => {
    const { db, storeInTx } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(applyTopicBreakdownToStat).mockReturnValue(makeStat() as any);

    await updateTopicStatsFromBreakdown([
      { topic: "Algebra", total: 2, correct: 1 },
      { topic: "Calculus", total: 3, correct: 2 },
    ]);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(storeInTx.put).toHaveBeenCalledTimes(2);
  });
});
