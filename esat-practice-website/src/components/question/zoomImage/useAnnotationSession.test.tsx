import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "../../../types/annotations";
import { loadAnnotations, saveAnnotations } from "../../../lib/annotationStore";
import { useAnnotationSession } from "./useAnnotationSession";

vi.mock("../../../lib/annotationStore", () => ({
  loadAnnotations: vi.fn(),
  saveAnnotations: vi.fn(),
}));

const pen: Annotation = {
  id: "pen-1", kind: "pen", color: "#111", width: 4,
  points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
};
const text: Annotation = {
  id: "text-1", kind: "text", color: "#222", x: 10, y: 20, fontSize: 16, text: "label",
};

describe("useAnnotationSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.mocked(loadAnnotations).mockReset().mockReturnValue([]);
    vi.mocked(saveAnnotations).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads persisted annotations and exposes a replay trigger on open", () => {
    vi.mocked(loadAnnotations).mockReturnValue([pen]);
    const { result } = renderHook(() => useAnnotationSession(true, true, "q1", 1000));
    expect(loadAnnotations).toHaveBeenCalledWith("q1");
    expect(result.current.annotations).toEqual([pen]);
    expect(result.current.replayNonce).toBe(1);
    expect(result.current.canUndo).toBe(false);
  });

  it("saves changes after the debounce and flushes latest state on unmount", () => {
    localStorage.setItem("esat-ann-hint-seen", "true");
    const { result, unmount } = renderHook(() => useAnnotationSession(true, true, "q1", 1000));
    act(() => result.current.handleCommitAnnotation(pen));
    act(() => vi.advanceTimersByTime(399));
    expect(saveAnnotations).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(saveAnnotations).toHaveBeenCalledWith("q1", [pen]);
    act(() => result.current.handleCommitAnnotation(text));
    unmount();
    expect(saveAnnotations).toHaveBeenLastCalledWith("q1", [pen, text]);
  });

  it("supports undo, redo, erase, update, and clear history", () => {
    const { result } = renderHook(() => useAnnotationSession(true, true, "q1", 1000));
    act(() => result.current.handleCommitAnnotation(pen));
    act(() => result.current.handleCommitAnnotation(text));
    act(() => result.current.undo());
    expect(result.current.annotations).toEqual([pen]);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    act(() => result.current.handleUpdateAnnotation({ ...text, text: "updated" }));
    expect(result.current.annotations[1]).toMatchObject({ text: "updated" });
    act(() => result.current.handleEraseAnnotation("pen-1"));
    expect(result.current.annotations).toHaveLength(1);
    act(() => result.current.clear());
    expect(result.current.annotations).toEqual([]);
    act(() => result.current.undo());
    expect(result.current.annotations).toHaveLength(1);
  });

  it("restores and persists colour and width preferences", () => {
    localStorage.setItem("esat-ann-prefs", JSON.stringify({
      penColor: "#d92d20", highlighterColor: "#86efac", widthIndex: 2,
    }));
    const { result } = renderHook(() => useAnnotationSession(true, false, undefined, 1000));
    expect(result.current.activeColor).toBe("#d92d20");
    expect(result.current.strokeWidth).toBe(result.current.widthPresets[2]);
    act(() => result.current.handleToolChange("highlighter"));
    act(() => result.current.handleColorChange("#93c5fd"));
    act(() => result.current.handleWidthChange(result.current.widthPresets[0]));
    expect(JSON.parse(localStorage.getItem("esat-ann-prefs") ?? "{}")).toEqual({
      penColor: "#d92d20", highlighterColor: "#93c5fd", widthIndex: 0,
    });
  });

  it("shows and dismisses the first-open hint and emits a saved pulse", () => {
    const { result } = renderHook(() => useAnnotationSession(true, true, "q1", 1000));
    expect(result.current.showHint).toBe(true);
    act(() => result.current.dismissHint());
    expect(result.current.showHint).toBe(false);
    expect(localStorage.getItem("esat-ann-hint-seen")).toBe("true");
    act(() => result.current.handleCommitAnnotation(pen));
    act(() => vi.advanceTimersByTime(416));
    expect(result.current.savedPulse).toBe(true);
    act(() => vi.advanceTimersByTime(1800));
    expect(result.current.savedPulse).toBe(false);
  });

  it("cancels hint, tool-hint, and RAF work during cleanup", () => {
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const { result, unmount } = renderHook(() => useAnnotationSession(true, true, "q1", 1000));
    act(() => result.current.handleToolChange("line"));
    expect(result.current.toolHint).toBeTruthy();
    unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(cancelFrame).toHaveBeenCalled();
  });
});
