import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "../../../types/annotations";
import { replayTiming } from "../annotationGeometry";
import { useAnnotationReplay } from "./useAnnotationReplay";

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function makeStroke(id: string): Annotation {
  return { id, kind: "pen", color: "#1f2933", width: 3, points: [{ x: 0, y: 0 }] };
}

const strokes = [makeStroke("a"), makeStroke("b"), makeStroke("c")];

describe("useAnnotationReplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not replay before the first storage load (nonce 0)", () => {
    const { result } = renderHook(() => useAnnotationReplay(strokes, 0));
    expect(result.current.getReplay("a")).toBeNull();
  });

  it("staggers loaded strokes by index and clears after the total duration", () => {
    const { result, rerender } = renderHook(
      ({ nonce }) => useAnnotationReplay(strokes, nonce),
      { initialProps: { nonce: 0 } },
    );

    rerender({ nonce: 1 });

    const { step, dur, total } = replayTiming(strokes.length);
    expect(result.current.getReplay("a")).toEqual({ delay: 0, dur });
    expect(result.current.getReplay("b")).toEqual({ delay: step, dur });
    expect(result.current.getReplay("c")).toEqual({ delay: 2 * step, dur });
    // A stroke drawn after the load isn't part of the replay.
    expect(result.current.getReplay("fresh")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(total);
    });
    expect(result.current.getReplay("a")).toBeNull();
  });

  it("restarting the replay supersedes the pending clear timer", () => {
    const { result, rerender } = renderHook(
      ({ nonce }) => useAnnotationReplay(strokes, nonce),
      { initialProps: { nonce: 0 } },
    );
    const { total, dur } = replayTiming(strokes.length);

    rerender({ nonce: 1 });
    act(() => {
      vi.advanceTimersByTime(total - 10);
    });
    rerender({ nonce: 2 });

    // The old timer (due in <10ms) was cancelled; the replay stays active
    // until the new one's full duration has elapsed.
    act(() => {
      vi.advanceTimersByTime(total - 10);
    });
    expect(result.current.getReplay("a")).toEqual({ delay: 0, dur });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current.getReplay("a")).toBeNull();
  });

  it("skips the replay when there are no annotations", () => {
    const { result, rerender } = renderHook(
      ({ nonce }) => useAnnotationReplay([], nonce),
      { initialProps: { nonce: 0 } },
    );
    rerender({ nonce: 1 });
    expect(result.current.getReplay("a")).toBeNull();
  });

  it("skips the replay when the user prefers reduced motion", () => {
    setReducedMotion(true);
    const { result, rerender } = renderHook(
      ({ nonce }) => useAnnotationReplay(strokes, nonce),
      { initialProps: { nonce: 0 } },
    );
    rerender({ nonce: 1 });
    expect(result.current.getReplay("a")).toBeNull();
  });

  it("clears the pending timer on unmount", () => {
    const { rerender, unmount } = renderHook(
      ({ nonce }) => useAnnotationReplay(strokes, nonce),
      { initialProps: { nonce: 0 } },
    );
    rerender({ nonce: 1 });
    expect(vi.getTimerCount()).toBe(1); // the scheduled replay-clear timer

    unmount();
    expect(vi.getTimerCount()).toBe(0); // cleanup cancelled it, no leak
  });
});
