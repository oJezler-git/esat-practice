import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listExcludedQuestionsFromDb,
  getExcludedQuestionIdsFromDb,
  excludeQuestionInDb,
  includeQuestionInDb,
} from "./excludedQuestionStore";
import { getDb } from "./db";

vi.mock("./db");

function createMockDb(opts: { excludedQuestions?: unknown[] } = {}) {
  return {
    getAll: vi.fn().mockResolvedValue(opts.excludedQuestions ?? []),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listExcludedQuestionsFromDb", () => {
  it("returns excluded questions sorted by excluded_at descending", async () => {
    const questions = [
      { question_id: "q1", excluded_at: 1000 },
      { question_id: "q2", excluded_at: 3000 },
      { question_id: "q3", excluded_at: 2000 },
    ];
    const db = createMockDb({ excludedQuestions: questions });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await listExcludedQuestionsFromDb();
    expect(result.map((q) => q.question_id)).toEqual(["q2", "q3", "q1"]);
  });

  it("returns an empty array when nothing is excluded", async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    expect(await listExcludedQuestionsFromDb()).toEqual([]);
  });

  it("queries the excludedQuestions store", async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    await listExcludedQuestionsFromDb();
    expect(db.getAll).toHaveBeenCalledWith("excludedQuestions");
  });
});

describe("getExcludedQuestionIdsFromDb", () => {
  it("returns a Set containing all excluded question IDs", async () => {
    const questions = [
      { question_id: "q1", excluded_at: 1000 },
      { question_id: "q2", excluded_at: 2000 },
    ];
    const db = createMockDb({ excludedQuestions: questions });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const ids = await getExcludedQuestionIdsFromDb();
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has("q1")).toBe(true);
    expect(ids.has("q2")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("returns an empty Set when nothing is excluded", async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    const ids = await getExcludedQuestionIdsFromDb();
    expect(ids.size).toBe(0);
  });
});

describe("excludeQuestionInDb", () => {
  it("puts a record with the question_id and a numeric excluded_at timestamp", async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);

    await excludeQuestionInDb("q-abc");

    expect(db.put).toHaveBeenCalledWith("excludedQuestions", {
      question_id: "q-abc",
      excluded_at: expect.any(Number),
    });
  });

  it("excluded_at is close to Date.now()", async () => {
    const before = Date.now();
    const db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    await excludeQuestionInDb("q-abc");
    const after = Date.now();

    const record = vi.mocked(db.put).mock.calls[0][1] as { excluded_at: number };
    expect(record.excluded_at).toBeGreaterThanOrEqual(before);
    expect(record.excluded_at).toBeLessThanOrEqual(after);
  });
});

describe("includeQuestionInDb", () => {
  it("deletes the record keyed by the question_id", async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);

    await includeQuestionInDb("q-abc");

    expect(db.delete).toHaveBeenCalledWith("excludedQuestions", "q-abc");
  });
});
