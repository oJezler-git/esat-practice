/**
 * Zustand excluded-question store against real IndexedDB semantics
 * (fake-indexeddb): exclude → listed → restore, including NSAA/ENGAA
 * duplicate-pair expansion.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  getExcludedQuestionIdsFromDb,
  useExcludedQuestionStore,
} from "./excludedQuestionStore";
import { clearAllStores } from "./db";
import { makeQuestion } from "../test-utils/factories";
import type { Question } from "../types/schema";

// analyseNsaaDuplicates pairs an ENGAA and an NSAA question when they share
// the same year/part and near-identical long text.
const sharedText =
  "A projectile is launched at 30 degrees above the horizontal with an " +
  "initial speed of 20 metres per second; find the maximum height reached.";

const engaaTwin = makeQuestion({
  id: "ENGAA-2019-twin",
  source: { paper: "ENGAA 2019", year: 2019, part: "1A" },
  content: { text: sharedText },
});
const nsaaTwin = makeQuestion({
  id: "NSAA-2019-twin",
  source: { paper: "NSAA 2019", year: 2019, part: "1A" },
  content: { text: sharedText },
});
const unrelated = makeQuestion({
  id: "ENGAA-2020-solo",
  source: { paper: "ENGAA 2020", year: 2020, part: "1A" },
  content: { text: "A completely different question about resistor networks and current flow." },
});

const allQuestions: Question[] = [engaaTwin, nsaaTwin, unrelated];

beforeEach(async () => {
  await clearAllStores();
});

describe("useExcludedQuestionStore", () => {
  it("loads the exclusion list from the database on first render", async () => {
    const { result } = renderHook(() => useExcludedQuestionStore());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      await result.current.excludeQuestion("ENGAA-2020-solo");
    });

    expect(result.current.excludedQuestionIds.has("ENGAA-2020-solo")).toBe(true);
    expect((await getExcludedQuestionIdsFromDb()).has("ENGAA-2020-solo")).toBe(true);
  });

  it("excludes and restores a question, keeping store and database in sync", async () => {
    const { result } = renderHook(() => useExcludedQuestionStore());
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      await result.current.excludeQuestion("ENGAA-2020-solo");
    });
    expect(result.current.excludedQuestions.map((entry) => entry.question_id)).toEqual([
      "ENGAA-2020-solo",
    ]);

    await act(async () => {
      await result.current.includeQuestion("ENGAA-2020-solo");
    });
    expect(result.current.excludedQuestions).toEqual([]);
    expect((await getExcludedQuestionIdsFromDb()).size).toBe(0);
  });

  it("expands an exclusion to the question's NSAA/ENGAA duplicate twin", async () => {
    const { result } = renderHook(() => useExcludedQuestionStore());
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      await result.current.excludeQuestion(engaaTwin.id, allQuestions);
    });

    const ids = await getExcludedQuestionIdsFromDb();
    expect(ids.has(engaaTwin.id)).toBe(true);
    expect(ids.has(nsaaTwin.id)).toBe(true);
    expect(ids.has(unrelated.id)).toBe(false);
  });

  it("restores both halves of a duplicate pair together", async () => {
    const { result } = renderHook(() => useExcludedQuestionStore());
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      await result.current.excludeQuestion(nsaaTwin.id, allQuestions);
    });
    expect((await getExcludedQuestionIdsFromDb()).size).toBe(2);

    await act(async () => {
      await result.current.includeQuestion(nsaaTwin.id, allQuestions);
    });
    expect((await getExcludedQuestionIdsFromDb()).size).toBe(0);
  });
});
