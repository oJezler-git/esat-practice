import { describe, it, expect } from "vitest";
import { truncateQuestionText } from "./textUtils";

describe("truncateQuestionText", () => {
  it("should return the full text if it is within the limit", () => {
    const text = "This is a short question.";
    expect(truncateQuestionText(text, 50)).toBe("This is a short question.");
  });

  it("should truncate to the nearest word boundary", () => {
    const text = "This is a longer question that needs truncation.";
    // "This is a longer" is 16 chars
    // "This is a longer question" is 25 chars
    expect(truncateQuestionText(text, 20)).toBe("This is a longer...");
  });

  it("should handle cases with no spaces before the limit", () => {
    const text = "Supercalifragilisticexpialidocious";
    expect(truncateQuestionText(text, 10)).toBe("Supercalif...");
  });

  it("should trim extra whitespace after truncation", () => {
    const text = "This is a test    ";
    expect(truncateQuestionText(text, 10)).toBe("This is a...");
  });
});
