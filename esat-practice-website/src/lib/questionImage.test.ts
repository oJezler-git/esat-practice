import { describe, it, expect } from "vitest";
import { getQuestionImageSrc } from "./questionImage";
import type { Question } from "../types/schema";

function makeQuestion(content: Partial<Question["content"]>): Question {
  return {
    id: "q1",
    source: { paper: "P", year: 2024, part: "A", subject: "Maths", page: 1 },
    content: { text: "text", ...content },
    answer: { correct: "A", verified: true },
    taxonomy: { primary_topic: "Algebra", secondary_topics: [], confidence: 1, model_used: "test" },
    meta: { times_attempted: 0, accuracy_rate: 0 },
  };
}

describe("getQuestionImageSrc", () => {
  it("prefers image_url over image_b64", () => {
    const question = makeQuestion({ image_url: "/data/images/q1.png", image_b64: "abc123" });
    expect(getQuestionImageSrc(question)).toBe("/data/images/q1.png");
  });

  it("wraps raw base64 in a data URL", () => {
    const question = makeQuestion({ image_b64: "abc123" });
    expect(getQuestionImageSrc(question)).toBe("data:image/png;base64,abc123");
  });

  it("leaves an already-prefixed data URL untouched", () => {
    const question = makeQuestion({ image_b64: "data:image/jpeg;base64,xyz" });
    expect(getQuestionImageSrc(question)).toBe("data:image/jpeg;base64,xyz");
  });

  it("returns undefined when no image is present", () => {
    const question = makeQuestion({});
    expect(getQuestionImageSrc(question)).toBeUndefined();
  });
});
