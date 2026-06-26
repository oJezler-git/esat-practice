import { describe, it, expect } from "vitest";
import {
  arrowHeadPath,
  buildSmoothPath,
  defaultStrokeWidth,
  ellipseAttrs,
  rectAttrs,
  replayTiming,
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

describe("replayTiming", () => {
  it("returns zeroed timing (no animation) for an empty set", () => {
    expect(replayTiming(0)).toEqual({ step: 0, dur: 320, total: 0 });
    expect(replayTiming(-5)).toEqual({ step: 0, dur: 320, total: 0 });
  });

  it("a single stroke draws for exactly one duration plus tail", () => {
    const { step, total } = replayTiming(1);
    // No stagger needed for one stroke; total is just dur + tail.
    expect(total).toBe(step * 0 + 320 + 80);
  });

  it("caps the per-stroke stagger so many strokes stay snappy", () => {
    // With many strokes 1500/count would shrink below the floor; it clamps to 35.
    expect(replayTiming(100).step).toBe(35);
    // A handful of strokes is clamped to the 85ms ceiling (1500/3 = 500 > 85).
    expect(replayTiming(3).step).toBe(85);
  });

  it("interpolates the stagger between the floor and ceiling", () => {
    // 1500 / 30 = 50, inside [35, 85].
    expect(replayTiming(30).step).toBe(50);
  });

  it("total accounts for stagger of all but the last stroke plus its draw time", () => {
    const { step, dur, total } = replayTiming(4);
    expect(total).toBe(step * 3 + dur + 80);
  });

  it("respects a custom stroke duration", () => {
    expect(replayTiming(1, 200).dur).toBe(200);
    expect(replayTiming(0, 200)).toEqual({ step: 0, dur: 200, total: 0 });
  });
});
