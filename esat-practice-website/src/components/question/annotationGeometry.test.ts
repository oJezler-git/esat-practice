import { describe, it, expect } from "vitest";
import {
  arrowHeadPath,
  buildSmoothPath,
  defaultStrokeWidth,
  ellipseAttrs,
  rectAttrs,
} from "./annotationGeometry";

describe("buildSmoothPath", () => {
  it("returns empty string for no points", () => {
    expect(buildSmoothPath([])).toBe("");
  });

  it("renders a degenerate dot for a single point", () => {
    expect(buildSmoothPath([{ x: 3, y: 4 }])).toBe("M 3 4 L 3 4");
  });

  it("renders a straight line for two points", () => {
    expect(buildSmoothPath([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toBe("M 0 0 L 10 20");
  });

  it("uses quadratic curves through midpoints for 3+ points", () => {
    const d = buildSmoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d).toContain("Q 10 0 15 0");
    expect(d.endsWith("L 20 0")).toBe(true);
  });
});

describe("rectAttrs", () => {
  it("normalizes corners regardless of drag direction", () => {
    expect(rectAttrs({ x: 10, y: 10 }, { x: 4, y: 6 })).toEqual({
      x: 4,
      y: 6,
      width: 6,
      height: 4,
    });
  });
});

describe("ellipseAttrs", () => {
  it("computes center and radii from the bounding box", () => {
    expect(ellipseAttrs({ x: 0, y: 0 }, { x: 20, y: 10 })).toEqual({
      cx: 10,
      cy: 5,
      rx: 10,
      ry: 5,
    });
  });
});

describe("arrowHeadPath", () => {
  it("produces a two-barb path ending at the arrow tip", () => {
    const d = arrowHeadPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    // Middle vertex of the head is the arrow tip.
    expect(d).toContain("L 10 0 L");
  });
});

describe("defaultStrokeWidth", () => {
  it("scales with image width and has a floor", () => {
    expect(defaultStrokeWidth(1000)).toBe(4);
    expect(defaultStrokeWidth(100)).toBe(2);
  });
});
