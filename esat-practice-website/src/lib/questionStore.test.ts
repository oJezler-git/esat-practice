import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyseNsaaDuplicates } from "./questionDedup";
import { getDerivedStoreState } from "./questionStore";
import type { Question } from "../types/schema";

vi.mock("./questionDedup");
vi.mock("./db");
vi.mock("./loader", () => ({ ensureBundledQuestionsBootstrapped: vi.fn().mockResolvedValue(undefined) }));

const mockAnalyse = vi.mocked(analyseNsaaDuplicates);

function emptyAnalysis() {
  return {
    hiddenNsaaIds: new Set<string>(),
    excludedPairs: [] as any[],
    nearMissPairs: [] as any[],
  };
}

beforeEach(() => {
  mockAnalyse.mockReturnValue(emptyAnalysis());
});

function makeQuestion(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    source: { paper: "ENGAA", year: 2020, part: "1A", subject: "Math", page: 1 },
    content: { text: "Question text" },
    answer: { correct: "A", verified: true },
    taxonomy: {
      primary_topic: "Algebra",
      secondary_topics: ["Numbers"],
      confidence: 0.9,
      model_used: "gpt-4",
    },
    meta: { times_attempted: 0, accuracy_rate: 0 },
    ...overrides,
  };
}

describe("getDerivedStoreState — basic filtering", () => {
  it("returns all questions when there are no exclusions or hidden duplicates", () => {
    const questions = [makeQuestion("q1"), makeQuestion("q2")];
    const result = getDerivedStoreState(questions, new Set());
    expect(result.questions).toHaveLength(2);
    expect(result.excludedQuestions).toHaveLength(0);
    expect(result.fullPracticeBank).toHaveLength(2);
  });

  it("removes excluded questions from the visible list", () => {
    const questions = [makeQuestion("q1"), makeQuestion("q2"), makeQuestion("q3")];
    const result = getDerivedStoreState(questions, new Set(["q1"]));
    expect(result.questions.map((q) => q.id)).toEqual(["q2", "q3"]);
    expect(result.excludedQuestions.map((q) => q.id)).toContain("q1");
  });

  it("fullPracticeBank includes hidden NSAA duplicates that are not explicitly excluded", () => {
    const nsaa = makeQuestion("nsaa-1");
    const engaa = makeQuestion("engaa-1");
    mockAnalyse.mockReturnValue({
      hiddenNsaaIds: new Set(["nsaa-1"]),
      excludedPairs: [],
      nearMissPairs: [],
    });
    const result = getDerivedStoreState([nsaa, engaa], new Set());
    // questions filters out nsaa-1 (it is a hidden NSAA duplicate)
    expect(result.questions.map((q) => q.id)).not.toContain("nsaa-1");
    // fullPracticeBank keeps it because it is not explicitly excluded
    expect(result.fullPracticeBank.map((q) => q.id)).toContain("nsaa-1");
  });

  it("hides NSAA duplicate questions listed in hiddenNsaaIds", () => {
    const questions = [makeQuestion("nsaa-1"), makeQuestion("q2")];
    mockAnalyse.mockReturnValue({
      hiddenNsaaIds: new Set(["nsaa-1"]),
      excludedPairs: [],
      nearMissPairs: [],
    });
    const result = getDerivedStoreState(questions, new Set());
    expect(result.questions.map((q) => q.id)).toEqual(["q2"]);
  });
});

describe("getDerivedStoreState — exclusion propagation (fixpoint loop)", () => {
  it("propagates exclusion from the ENGAA side to its NSAA duplicate", () => {
    const engaa = makeQuestion("engaa-1");
    const nsaa = makeQuestion("nsaa-1");
    const other = makeQuestion("q3");

    mockAnalyse.mockReturnValue({
      hiddenNsaaIds: new Set<string>(),
      excludedPairs: [
        {
          engaaQuestion: engaa,
          nsaaQuestion: nsaa,
          similarity: 0.95,
          textLengthRatio: 1,
          year: 2020,
          partKey: "1a",
        },
      ],
      nearMissPairs: [],
    });

    const result = getDerivedStoreState([engaa, nsaa, other], new Set(["engaa-1"]));
    const excludedIds = result.excludedQuestions.map((q) => q.id);
    expect(excludedIds).toContain("engaa-1");
    expect(excludedIds).toContain("nsaa-1");
    expect(result.questions.map((q) => q.id)).toContain("q3");
  });

  it("propagates exclusion from the NSAA side to its ENGAA duplicate", () => {
    const engaa = makeQuestion("engaa-2");
    const nsaa = makeQuestion("nsaa-2");

    mockAnalyse.mockReturnValue({
      hiddenNsaaIds: new Set<string>(),
      excludedPairs: [
        {
          engaaQuestion: engaa,
          nsaaQuestion: nsaa,
          similarity: 0.95,
          textLengthRatio: 1,
          year: 2020,
          partKey: "1b",
        },
      ],
      nearMissPairs: [],
    });

    const result = getDerivedStoreState([engaa, nsaa], new Set(["nsaa-2"]));
    const excludedIds = result.excludedQuestions.map((q) => q.id);
    expect(excludedIds).toContain("engaa-2");
    expect(excludedIds).toContain("nsaa-2");
  });
});

describe("getDerivedStoreState — derived topic and year sets", () => {
  it("collects primary and secondary topics and sorts them alphabetically", () => {
    const questions = [
      makeQuestion("q1", {
        taxonomy: {
          primary_topic: "Calculus",
          secondary_topics: ["Algebra"],
          confidence: 0.9,
          model_used: "gpt-4",
        },
      }),
      makeQuestion("q2", {
        taxonomy: {
          primary_topic: "Algebra",
          secondary_topics: [],
          confidence: 0.9,
          model_used: "gpt-4",
        },
      }),
      makeQuestion("q3", {
        taxonomy: {
          primary_topic: "Numbers",
          secondary_topics: ["Calculus"],
          confidence: 0.9,
          model_used: "gpt-4",
        },
      }),
    ];
    const result = getDerivedStoreState(questions, new Set());
    expect(result.availableTopics).toEqual(["Algebra", "Calculus", "Numbers"]);
  });

  it("deduplicates topics that appear in multiple questions", () => {
    const questions = [
      makeQuestion("q1", {
        taxonomy: { primary_topic: "Algebra", secondary_topics: [], confidence: 0.9, model_used: "gpt-4" },
      }),
      makeQuestion("q2", {
        taxonomy: { primary_topic: "Algebra", secondary_topics: [], confidence: 0.9, model_used: "gpt-4" },
      }),
    ];
    const result = getDerivedStoreState(questions, new Set());
    expect(result.availableTopics.filter((t) => t === "Algebra")).toHaveLength(1);
  });

  it("collects and sorts years numerically", () => {
    const questions = [
      makeQuestion("q1", {
        source: { paper: "ENGAA", year: 2022, part: "1A", subject: "Math", page: 1 },
      }),
      makeQuestion("q2", {
        source: { paper: "ENGAA", year: 2019, part: "1A", subject: "Math", page: 1 },
      }),
      makeQuestion("q3", {
        source: { paper: "ENGAA", year: 2021, part: "1A", subject: "Math", page: 1 },
      }),
    ];
    const result = getDerivedStoreState(questions, new Set());
    expect(result.availableYears).toEqual([2019, 2021, 2022]);
  });

  it("excludes topics and years of excluded questions from available sets", () => {
    const questions = [
      makeQuestion("q1", {
        taxonomy: { primary_topic: "Trigonometry", secondary_topics: [], confidence: 0.9, model_used: "gpt-4" },
        source: { paper: "ENGAA", year: 2018, part: "1A", subject: "Math", page: 1 },
      }),
      makeQuestion("q2", {
        taxonomy: { primary_topic: "Algebra", secondary_topics: [], confidence: 0.9, model_used: "gpt-4" },
        source: { paper: "ENGAA", year: 2020, part: "1A", subject: "Math", page: 1 },
      }),
    ];
    // Exclude q1 (Trigonometry / 2018)
    const result = getDerivedStoreState(questions, new Set(["q1"]));
    expect(result.availableTopics).not.toContain("Trigonometry");
    expect(result.availableYears).not.toContain(2018);
  });
});

describe("getDerivedStoreState — memoisation", () => {
  it("returns the same object reference when called twice with identical input references", () => {
    const questions = [makeQuestion("q1")];
    const excluded = new Set<string>();
    const first = getDerivedStoreState(questions, excluded);
    const second = getDerivedStoreState(questions, excluded);
    expect(second).toBe(first);
  });

  it("recomputes when the questions array reference changes", () => {
    const q = makeQuestion("q1");
    const excluded = new Set<string>();
    const first = getDerivedStoreState([q], excluded);
    const second = getDerivedStoreState([q], excluded); // new array reference
    expect(second).not.toBe(first);
  });
});
