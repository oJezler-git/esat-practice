import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSession } from "./sessionBuilder";
import { useSettingsStore } from "../lib/settingsStore";
import type { Question } from "../types/schema";

vi.mock("../lib/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

describe("sessionBuilder", () => {
  const mockQuestions: Question[] = [
    {
      id: "q1",
      taxonomy: { primary_topic: "Math", secondary_topics: ["Logic"] },
      source: { paper: "Paper A", year: 2020, page: 1 },
    } as any,
    {
      id: "q2",
      taxonomy: { primary_topic: "Physics", secondary_topics: [] },
      source: { paper: "Paper B", year: 2021, page: 2 },
    } as any,
    {
      id: "q3",
      taxonomy: { primary_topic: "Math", secondary_topics: ["Geometry"] },
      source: { paper: "Paper A", year: 2020, page: 5 },
    } as any,
  ];

  beforeEach(() => {
    vi.mocked(useSettingsStore.getState).mockReturnValue({
      settings: {
        defaultMode: "untimed",
        defaultQuestionCount: 20,
      },
    } as any);
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

  it("should sort by year and page in untimed mode", () => {
    const result = buildSession(mockQuestions, { mode: "untimed" });
    // q1: 2020, p1
    // q3: 2020, p5
    // q2: 2021, p2
    expect(result).toEqual(["q1", "q3", "q2"]);
  });

  it("should respect question_count limit", () => {
    const result = buildSession(mockQuestions, { question_count: 1 });
    expect(result).toHaveLength(1);
  });

  it("should use default settings if config is partial", () => {
    vi.mocked(useSettingsStore.getState).mockReturnValue({
      settings: {
        defaultQuestionCount: 2,
        defaultMode: "untimed"
      },
    } as any);

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
