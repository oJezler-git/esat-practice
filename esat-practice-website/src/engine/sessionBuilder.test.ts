import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSession } from "./sessionBuilder";
import { useSettingsStore } from "../lib/settingsStore";
import { makeQuestion } from "../test-utils/factories";
import { DEFAULT_SETTINGS } from "../types/settings";

function mockSettings(overrides: Partial<typeof DEFAULT_SETTINGS>) {
  vi.mocked(useSettingsStore.getState).mockReturnValue({
    settings: { ...DEFAULT_SETTINGS, ...overrides },
  } as ReturnType<typeof useSettingsStore.getState>);
}

vi.mock("../lib/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

describe("sessionBuilder", () => {
  const mockQuestions = [
    makeQuestion({
      id: "q1",
      taxonomy: { primary_topic: "Math", secondary_topics: ["Logic"] },
      source: { paper: "Paper A", year: 2020, page: 1 },
    }),
    makeQuestion({
      id: "q2",
      taxonomy: { primary_topic: "Physics", secondary_topics: [] },
      source: { paper: "Paper B", year: 2021, page: 2 },
    }),
    makeQuestion({
      id: "q3",
      taxonomy: { primary_topic: "Math", secondary_topics: ["Geometry"] },
      source: { paper: "Paper A", year: 2020, page: 5 },
    }),
  ];

  beforeEach(() => {
    mockSettings({ defaultMode: "untimed", defaultQuestionCount: 20 });
  });

  it("should filter by primary topic", () => {
    const result = buildSession(mockQuestions, { topic_filter: ["Physics"] });
    expect(result).toEqual(["q2"]);
  });

  it("should filter by secondary topic", () => {
    const result = buildSession(mockQuestions, { topic_filter: ["Logic"] });
    expect(result).toEqual(["q1"]);
  });

  it("should filter by multiple topics (union)", () => {
    const result = buildSession(mockQuestions, { topic_filter: ["Physics", "Geometry"] });
    expect(result).toContain("q2");
    expect(result).toContain("q3");
    expect(result).toHaveLength(2);
  });

  it("should filter by year", () => {
    const result = buildSession(mockQuestions, { year_filter: [2021] });
    expect(result).toEqual(["q2"]);
  });

  it("should filter by paper", () => {
    const result = buildSession(mockQuestions, { paper_filter: ["Paper A"] });
    expect(result).toContain("q1");
    expect(result).toContain("q3");
    expect(result).toHaveLength(2);
  });

  it("randomly samples and orders an untimed session", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const multiYearQuestions = [
      ...mockQuestions,
      makeQuestion({
        id: "q4",
        taxonomy: { primary_topic: "Math", secondary_topics: [] },
        source: { paper: "Paper C", year: 2019, page: 1 },
      }),
    ];

    try {
      const result = buildSession(multiYearQuestions, {
        mode: "untimed",
        question_count: 2,
      });

      // A zero-valued Fisher-Yates draw picks q2 and q3, rather than the first
      // two chronological questions (q4 and q1), and preserves the random
      // order for the untimed session.
      expect(result).toEqual(["q2", "q3"]);
    } finally {
      random.mockRestore();
    }
  });

  it("should respect question_count limit", () => {
    const result = buildSession(mockQuestions, { question_count: 1 });
    expect(result).toHaveLength(1);
  });

  it("should use default settings if config is partial", () => {
    mockSettings({ defaultQuestionCount: 2, defaultMode: "untimed" });

    const result = buildSession(mockQuestions, {});
    expect(result).toHaveLength(2);
  });

  it("should return all questions if no filter matches", () => {
    const result = buildSession(mockQuestions, {});
    expect(result).toHaveLength(3);
  });

  it("should shuffle in timed mode", () => {
    // We can't easily test "randomness" but we can check it's a permutation
    const result = buildSession(mockQuestions, { mode: "timed" });
    expect(result).toHaveLength(3);
    expect(result).toContain("q1");
    expect(result).toContain("q2");
    expect(result).toContain("q3");
  });
});
