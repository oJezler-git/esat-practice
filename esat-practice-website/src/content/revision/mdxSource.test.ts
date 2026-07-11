import { describe, expect, it } from "vitest";
import { extractMetaSource, stripMdxExports } from "./mdxSource";

describe("mdxSource", () => {
  it("extracts the meta source block", () => {
    const raw = `export const meta = {
  title: "Units",
  module: "m1",
};

# Units`;

    expect(extractMetaSource(raw)).toBe(`export const meta = {
  title: "Units",
  module: "m1",
};`);
  });

  it("strips the meta export from MDX content", () => {
    const raw = `export const meta = {
  title: "Units",
};

## Standard units`;

    expect(stripMdxExports(raw)).toBe("## Standard units");
  });

  it("handles nested braces in the meta object", () => {
    const raw = `export const meta = {
  title: "Algebra",
  relatedQuestionFilters: {
    topics: ["Algebra"],
  },
};

Body`;

    expect(extractMetaSource(raw)).toContain("relatedQuestionFilters");
    expect(extractMetaSource(raw)?.trim().endsWith("};")).toBe(true);
    expect(stripMdxExports(raw)).toBe("Body");
  });

  it("accepts a meta block without a trailing semicolon", () => {
    const raw = `export const meta = {
  title: "Forces",
}

Body`;

    expect(extractMetaSource(raw)).toBe(`export const meta = {
  title: "Forces",
}`);
    expect(stripMdxExports(raw)).toBe("Body");
  });

  it("returns undefined and trimmed content when no meta block is present", () => {
    const raw = `
## No metadata
`;

    expect(extractMetaSource(raw)).toBeUndefined();
    expect(stripMdxExports(raw)).toBe("## No metadata");
  });

  it("treats an unclosed meta block as consuming the remaining source", () => {
    const raw = `export const meta = {
  title: "Broken",

## Body that is still inside the malformed block`;

    expect(extractMetaSource(raw)).toBe(raw);
    expect(stripMdxExports(raw)).toBe("");
  });
});
