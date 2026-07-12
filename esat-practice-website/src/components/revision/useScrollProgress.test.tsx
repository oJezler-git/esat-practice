import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useScrollProgress } from "./useScrollProgress";
import { useRevisionProgress } from "../../store/revisionProgress";

const el = document.createElement("article");
const ref = { current: el };

function setGeometry(opts: {
  scrollY: number;
  innerHeight: number;
  rectTop: number;
  scrollHeight: number;
}) {
  Object.defineProperty(window, "scrollY", {
    value: opts.scrollY,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: opts.innerHeight,
    configurable: true,
  });
  Object.defineProperty(el, "scrollHeight", {
    value: opts.scrollHeight,
    configurable: true,
  });
  el.getBoundingClientRect = () =>
    ({ top: opts.rectTop, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
}

function pctFor(docId: string) {
  return useRevisionProgress.getState().topics[docId]?.scrollPct;
}

beforeEach(() => {
  localStorage.clear();
  useRevisionProgress.getState().reset();
  // rAF runs synchronously so scroll handlers resolve within act().
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useScrollProgress", () => {
  it("reports the revealed percentage for top / mid / bottom positions", () => {
    // scrollHeight 2000, viewport 1000 → revealed = innerHeight - rectTop.
    setGeometry({ scrollY: 0, innerHeight: 1000, rectTop: 0, scrollHeight: 2000 });
    const { unmount } = renderHook(() => useScrollProgress(ref, "m1/top", true));
    act(() => vi.advanceTimersByTime(400));
    expect(pctFor("m1/top")).toBe(50);
    unmount();

    setGeometry({ scrollY: 1000, innerHeight: 1000, rectTop: -500, scrollHeight: 2000 });
    const r2 = renderHook(() => useScrollProgress(ref, "m1/mid", true));
    act(() => vi.advanceTimersByTime(400));
    expect(pctFor("m1/mid")).toBe(75);
    r2.unmount();

    setGeometry({ scrollY: 1000, innerHeight: 1000, rectTop: -1000, scrollHeight: 2000 });
    const r3 = renderHook(() => useScrollProgress(ref, "m1/bottom", true));
    act(() => vi.advanceTimersByTime(400));
    expect(pctFor("m1/bottom")).toBe(100);
    r3.unmount();
  });

  it("reports 100 for an article shorter than the viewport", () => {
    setGeometry({ scrollY: 0, innerHeight: 1000, rectTop: 0, scrollHeight: 400 });
    renderHook(() => useScrollProgress(ref, "m1/short", true));
    act(() => vi.advanceTimersByTime(400));
    expect(pctFor("m1/short")).toBe(100);
  });

  it("keeps the running max across a scroll-up", () => {
    setGeometry({ scrollY: 1000, innerHeight: 1000, rectTop: -1000, scrollHeight: 2000 });
    renderHook(() => useScrollProgress(ref, "m1/max", true));
    act(() => vi.advanceTimersByTime(400));
    expect(pctFor("m1/max")).toBe(100);

    // Scroll back to the top — the reported value must not drop.
    setGeometry({ scrollY: 0, innerHeight: 1000, rectTop: 0, scrollHeight: 2000 });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(400);
    });
    expect(pctFor("m1/max")).toBe(100);
  });

  it("flushes the final value to the store on unmount", () => {
    setGeometry({ scrollY: 0, innerHeight: 1000, rectTop: 0, scrollHeight: 2000 });
    const { unmount } = renderHook(() => useScrollProgress(ref, "m1/flush", true));
    // Unmount before the debounce window elapses.
    act(() => unmount());
    expect(pctFor("m1/flush")).toBe(50);
  });

  it("does nothing while disabled", () => {
    setGeometry({ scrollY: 0, innerHeight: 1000, rectTop: 0, scrollHeight: 2000 });
    const { unmount } = renderHook(() => useScrollProgress(ref, "m1/off", false));
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(400);
      unmount();
    });
    expect(pctFor("m1/off")).toBeUndefined();
  });
});
