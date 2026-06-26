import type { AnnPoint } from "../../types/annotations";

// Pure geometry helpers for the drawing layer. Kept free of DOM/React so they
// can be unit-tested directly (jsdom doesn't implement SVG getScreenCTM).

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build a smoothed SVG path from a freehand point list using quadratic Béziers
 * through the midpoints of consecutive samples (standard signature smoothing).
 * Returns "" for empty input and a tiny dot path for a single point.
 */
export function buildSmoothPath(points: AnnPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    // Degenerate dot: a zero-length line still renders with round linecaps.
    return `M ${round(p.x)} ${round(p.y)} L ${round(p.x)} ${round(p.y)}`;
  }
  if (points.length === 2) {
    return `M ${round(points[0].x)} ${round(points[0].y)} L ${round(points[1].x)} ${round(points[1].y)}`;
  }

  let d = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    d += ` Q ${round(current.x)} ${round(current.y)} ${round(midX)} ${round(midY)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${round(last.x)} ${round(last.y)}`;
  return d;
}

/** Path for an arrow head (two barbs) at `end`, pointing away from `start`. */
export function arrowHeadPath(start: AnnPoint, end: AnnPoint, size: number): string {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const spread = Math.PI / 7; // ~26° half-angle
  const x1 = end.x - size * Math.cos(angle - spread);
  const y1 = end.y - size * Math.sin(angle - spread);
  const x2 = end.x - size * Math.cos(angle + spread);
  const y2 = end.y - size * Math.sin(angle + spread);
  return `M ${round(x1)} ${round(y1)} L ${round(end.x)} ${round(end.y)} L ${round(x2)} ${round(y2)}`;
}

/** Normalized rect attributes from two drag corners. */
export function rectAttrs(start: AnnPoint, end: AnnPoint): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: round(Math.min(start.x, end.x)),
    y: round(Math.min(start.y, end.y)),
    width: round(Math.abs(end.x - start.x)),
    height: round(Math.abs(end.y - start.y)),
  };
}

/** Ellipse attributes inscribed in the drag bounding box. */
export function ellipseAttrs(start: AnnPoint, end: AnnPoint): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
} {
  return {
    cx: round((start.x + end.x) / 2),
    cy: round((start.y + end.y) / 2),
    rx: round(Math.abs(end.x - start.x) / 2),
    ry: round(Math.abs(end.y - start.y) / 2),
  };
}

/**
 * Map a client (screen) coordinate into the SVG's user space, accounting for
 * the parent's CSS transform via getScreenCTM. Falls back to the element's
 * bounding box if CTM is unavailable.
 */
export function clientToUser(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): AnnPoint {
  const ctm = svg.getScreenCTM();
  if (ctm) {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const mapped = point.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  }
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const scaleX = viewBox.width ? viewBox.width / rect.width : 1;
  const scaleY = viewBox.height ? viewBox.height / rect.height : 1;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/** Default ink width in natural-image units derived from the image size. */
export function defaultStrokeWidth(naturalWidth: number): number {
  return Math.max(2, Math.round(naturalWidth * 0.0035));
}

export type ReplayTiming = {
  /** Delay between successive strokes starting to draw, in ms. */
  step: number;
  /** Draw-on duration of a single stroke, in ms. */
  dur: number;
  /** Total wall-clock time until every stroke has finished, in ms. */
  total: number;
};

/**
 * Timing for the staggered "draw-in" replay shown when a saved scan is reopened.
 * The per-stroke stagger is clamped so the whole replay stays snappy (~1.5s of
 * stagger) no matter how many strokes there are. Returns zeroed timing for an
 * empty set so callers can skip the animation entirely.
 */
export function replayTiming(count: number, dur = 320): ReplayTiming {
  if (count <= 0) return { step: 0, dur, total: 0 };
  const step = Math.min(85, Math.max(35, 1500 / count));
  const total = step * (count - 1) + dur + 80;
  return { step, dur, total };
}
