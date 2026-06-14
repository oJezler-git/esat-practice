import { describe, it, expect } from "vitest";
import { analyseNsaaDuplicates, DEFAULT_DUPLICATE_MATCH_OPTIONS } from "./questionDedup";
import type { Question } from "../types/schema";

describe("questionDedup", () => {
  const createMockQuestion = (id: string, text: string, paper: string, year: number): Question => ({
    id,
    content: { text },
    source: { paper, year, part: "Part A", subject: "Math", page: 1 },
    taxonomy: { primary_topic: "Math", secondary_topics: [], confidence: 1, model_used: "human" },
    answer: { correct: "A", verified: true },
    meta: { times_attempted: 0, accuracy_rate: 0 },
  });

  it("should identify exact duplicates across ENGAA and NSAA", () => {
    const questions: Question[] = [
      createMockQuestion("ENGAA_1", "The sum of 1 and 1 is 2. This is a longer text to pass the minimum length threshold of forty characters.", "ENGAA 2016", 2016),
      createMockQuestion("NSAA_1", "The sum of 1 and 1 is 2. This is a longer text to pass the minimum length threshold of forty characters.", "NSAA 2016", 2016),
    ];

    const result = analyseNsaaDuplicates(questions);
    expect(result.hiddenNsaaIds.has("NSAA_1")).toBe(true);
    expect(result.excludedPairs).toHaveLength(1);
    expect(result.excludedPairs[0].similarity).toBe(1);
  });

  it("should identify near-exact duplicates with minor formatting differences", () => {
    const questions: Question[] = [
      createMockQuestion("ENGAA_1", "The sum of 1 and 1 is 2. This is a longer text to pass the minimum length threshold of forty characters.", "ENGAA 2016", 2016),
      createMockQuestion("NSAA_1", "The SUM of 1 and 1 is 2! This is a LONGER text to pass the minimum length threshold of FORTY characters.", "NSAA 2016", 2016),
    ];

    const result = analyseNsaaDuplicates(questions);
    expect(result.hiddenNsaaIds.has("NSAA_1")).toBe(true);
    expect(result.excludedPairs[0].similarity).toBeGreaterThan(0.95);
  });

  it("should not mark questions from different years as duplicates", () => {
    const questions: Question[] = [
      createMockQuestion("ENGAA_1", "The sum of 1 and 1 is 2. This is a longer text to pass the minimum length threshold.", "ENGAA 2016", 2016),
      createMockQuestion("NSAA_1", "The sum of 1 and 1 is 2. This is a longer text to pass the minimum length threshold.", "NSAA 2017", 2017),
    ];

    const result = analyseNsaaDuplicates(questions);
    expect(result.hiddenNsaaIds.has("NSAA_1")).toBe(false);
  });

  it("should not mark unrelated questions as duplicates", () => {
    const questions: Question[] = [
      createMockQuestion("ENGAA_1", "What is the acceptance rate for Cambridge Engineering? Low enough that launching yourself there via rocket may be statistically easier.", "ENGAA 2016", 2016),
      createMockQuestion("NSAA_1", "A penguin walks into a car dealership and asks to see the manager. The manager is also a penguin. Nobody comments on this. (Wtf?)", "NSAA 2016", 2016),
    ];

    const result = analyseNsaaDuplicates(questions);
    expect(result.hiddenNsaaIds.has("NSAA_1")).toBe(false);
  });

  it("should handle very short questions by ignoring them", () => {
    const questions: Question[] = [
      createMockQuestion("ENGAA_1", "Short", "ENGAA 2016", 2016),
      createMockQuestion("NSAA_1", "Short", "NSAA 2016", 2016),
    ];

    const result = analyseNsaaDuplicates(questions, {
        ...DEFAULT_DUPLICATE_MATCH_OPTIONS,
        minTextLength: 40
    });
    expect(result.hiddenNsaaIds.size).toBe(0);
  });

  it("should report near misses for manual review", () => {
    // Creating a pair that is similar but below the 0.9 threshold
    const questions: Question[] = [
      createMockQuestion("ENGAA_1", "The quick brown fox jumps over the lazy dog many times.", "ENGAA 2016", 2016),
      createMockQuestion("NSAA_1", "The quick brown cat jumps over the lazy dog many times.", "NSAA 2016", 2016),
    ];

    const result = analyseNsaaDuplicates(questions, {
        ...DEFAULT_DUPLICATE_MATCH_OPTIONS,
        similarityThreshold: 0.95 // Force a near miss
    });

    expect(result.hiddenNsaaIds.has("NSAA_1")).toBe(false);
    expect(result.nearMissPairs).toHaveLength(1);
    expect(result.nearMissPairs[0].nsaaQuestion.id).toBe("NSAA_1");
  });
});
