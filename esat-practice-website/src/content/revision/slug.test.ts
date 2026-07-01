import { describe, expect, it } from "vitest";
import { buildUniqueHeadingId, slugifyHeading } from "./slug";

describe("revision heading slugs", () => {
  it("normalises heading text into stable ids", () => {
    expect(slugifyHeading("Wilson CI & Score Ranges!")).toBe("wilson-ci-and-score-ranges");
  });

  it("deduplicates repeated headings", () => {
    const used = new Set<string>();

    expect(buildUniqueHeadingId("Worked example", used)).toBe("worked-example");
    expect(buildUniqueHeadingId("Worked example", used)).toBe("worked-example-2");
    expect(buildUniqueHeadingId("Worked example", used)).toBe("worked-example-3");
  });
});
