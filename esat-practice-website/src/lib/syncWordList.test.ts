import { describe, it, expect } from "vitest";
import { validateWordPair, ADJECTIVES, NOUNS } from "./syncWordList";

describe("validateWordPair", () => {
  it("accepts a valid hyphenated word pair", () => {
    expect(validateWordPair("amber-forest")).toEqual({ valid: true });
  });

  it("rejects input with no hyphen", () => {
    const result = validateWordPair("amberforest");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/hyphen/i);
  });

  it("rejects input with more than one hyphen", () => {
    const result = validateWordPair("amber-forest-hill");
    expect(result.valid).toBe(false);
  });

  it("rejects words containing numbers", () => {
    const result = validateWordPair("amber1-forest");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/letters/i);
  });

  it("rejects words containing spaces", () => {
    const result = validateWordPair("amber forest");
    expect(result.valid).toBe(false);
  });

  it("rejects words containing uppercase letters", () => {
    const result = validateWordPair("Amber-Forest");
    expect(result.valid).toBe(false);
  });

  it("rejects a word shorter than 2 characters", () => {
    const result = validateWordPair("a-forest");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/2 and 20/);
  });

  it("rejects a word longer than 20 characters", () => {
    const result = validateWordPair("amber-abcdefghijklmnopqrstu");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/2 and 20/);
  });

  it("accepts words at boundary lengths (2 and 20)", () => {
    expect(validateWordPair("ab-cd")).toEqual({ valid: true });
    const long = "abcdefghijklmnopqrst"; // 20 chars
    expect(validateWordPair(`ab-${long}`)).toEqual({ valid: true });
  });

  it("trims leading/trailing whitespace before validating", () => {
    expect(validateWordPair("  amber-forest  ")).toEqual({ valid: true });
  });
});

describe("ADJECTIVES and NOUNS lists", () => {
  it("ADJECTIVES is non-empty and contains only lowercase strings", () => {
    expect(ADJECTIVES.length).toBeGreaterThan(0);
    for (const word of ADJECTIVES) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it("NOUNS is non-empty and contains only lowercase strings", () => {
    expect(NOUNS.length).toBeGreaterThan(0);
    for (const word of NOUNS) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it("all ADJECTIVES are between 2 and 20 characters", () => {
    for (const word of ADJECTIVES) {
      expect(word.length).toBeGreaterThanOrEqual(2);
      expect(word.length).toBeLessThanOrEqual(20);
    }
  });

  it("all NOUNS are between 2 and 20 characters", () => {
    for (const word of NOUNS) {
      expect(word.length).toBeGreaterThanOrEqual(2);
      expect(word.length).toBeLessThanOrEqual(20);
    }
  });
});
