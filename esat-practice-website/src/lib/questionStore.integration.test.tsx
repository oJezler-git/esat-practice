/**
 * Question store against real IndexedDB semantics (fake-indexeddb): the
 * zustand load path, id-order preservation, and the composed useQuestionStore
 * hook (questions + exclusions + subject settings).
 */
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useQuestionStore } from "./questionStore";
import { excludeQuestionInDb } from "./excludedQuestionStore";
import { getDb } from "./db";
import { makeQuestion } from "../test-utils/factories";

vi.mock("./loader", () => ({
  ensureBundledQuestionsBootstrapped: vi.fn().mockResolvedValue(undefined),
}));

const questions = [
  makeQuestion({
    id: "q-alg",
    source: { paper: "ENGAA 2020", year: 2020, page: 3 },
    taxonomy: { primary_topic: "Algebra", secondary_topics: ["Logic"] },
  }),
  makeQuestion({
    id: "q-mech",
    source: { paper: "ENGAA 2021", year: 2021, page: 1 },
    taxonomy: { primary_topic: "Mechanics" },
  }),
  makeQuestion({
    id: "q-excluded",
    source: { paper: "ENGAA 2019", year: 2019, page: 7 },
    taxonomy: { primary_topic: "Geometry" },
  }),
];

beforeAll(async () => {
  const database = await getDb();
  for (const question of questions) {
    await database.put("questions", question);
  }
  await excludeQuestionInDb("q-excluded");
});

describe("useQuestionStore", () => {
  it("loads questions from the database and applies exclusions", async () => {
    const { result } = renderHook(() => useQuestionStore());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    // allQuestions is the raw bank, sorted by year/paper/page.
    expect(result.current.allQuestions.map((question) => question.id)).toEqual([
      "q-excluded",
      "q-alg",
      "q-mech",
    ]);
    // The practice list drops the excluded question...
    expect(result.current.questions.map((question) => question.id)).toEqual([
      "q-alg",
      "q-mech",
    ]);
    // ...which is surfaced separately for the "Excluded" tab.
    expect(result.current.excludedQuestions.map((question) => question.id)).toEqual([
      "q-excluded",
    ]);
    expect(result.current.excludedQuestionIds.has("q-excluded")).toBe(true);
  });

  it("derives available topics (incl. secondary) and years from visible questions", async () => {
    const { result } = renderHook(() => useQuestionStore());
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.availableTopics).toEqual(["Algebra", "Logic", "Mechanics"]);
    expect(result.current.availableYears).toEqual([2020, 2021]);
  });

  it("getQuestionsByIds returns questions in the requested order", async () => {
    const { result } = renderHook(() => useQuestionStore());
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    let ordered: Awaited<ReturnType<typeof result.current.getQuestionsByIds>> = [];
    await act(async () => {
      ordered = await result.current.getQuestionsByIds(["q-mech", "q-alg"]);
    });
    expect(ordered.map((question) => question.id)).toEqual(["q-mech", "q-alg"]);

    // Unknown ids are dropped rather than returned as holes.
    await act(async () => {
      ordered = await result.current.getQuestionsByIds(["missing", "q-alg"]);
    });
    expect(ordered.map((question) => question.id)).toEqual(["q-alg"]);
  });
});
