import { describe, it, expect } from "vitest";
import { subjectForTopic } from "./subjects";

describe("subjectForTopic", () => {
  it("classifies maths1 topics", () => {
    expect(subjectForTopic("M4. Algebra")).toBe("maths1");
  });

  it("classifies maths2 topics before falling through to maths1", () => {
    expect(subjectForTopic("MM6. Differentiation")).toBe("maths2");
  });

  it("classifies physics topics", () => {
    expect(subjectForTopic("P3. Mechanics")).toBe("physics");
  });

  it("classifies chemistry topics", () => {
    expect(subjectForTopic("C1. Atomic Structure")).toBe("chemistry");
  });

  it("classifies biology topics", () => {
    expect(subjectForTopic("B1. Cells")).toBe("biology");
  });

  it("returns null for unrecognised prefixes", () => {
    expect(subjectForTopic("Unclassified topic")).toBeNull();
  });

  it("returns null for null/undefined/empty input", () => {
    expect(subjectForTopic(null)).toBeNull();
    expect(subjectForTopic(undefined)).toBeNull();
    expect(subjectForTopic("")).toBeNull();
  });
});
