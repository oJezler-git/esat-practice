import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLabelEditor } from "./useLabelEditor";

function setup() {
  const callbacks = {
    onCommit: vi.fn(), onErase: vi.fn(), onUpdate: vi.fn(), onTextEditingChange: vi.fn(),
  };
  const hook = renderHook(() => useLabelEditor({ color: "#123456", fontSize: 20, ...callbacks }));
  return { ...hook, callbacks };
}

describe("useLabelEditor", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("commits trimmed text and math labels", () => {
    const { result, callbacks } = setup();
    act(() => result.current.startNewEditor({ x: 10, y: 15 }, "text"));
    act(() => result.current.setEditorText("  note  "));
    act(() => result.current.commitEditor());
    expect(callbacks.onCommit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "text", color: "#123456", x: 10, y: 35, fontSize: 20, text: "note",
    }));
    act(() => result.current.startNewEditor({ x: 5, y: 8 }, "math"));
    act(() => result.current.setEditorText(" x^2 "));
    act(() => result.current.commitEditor());
    expect(callbacks.onCommit).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: "math", x: 5, y: 8, latex: "x^2",
    }));
  });

  it("updates an existing label and erases it when committed empty", () => {
    const { result, callbacks } = setup();
    const label = { id: "label-1", kind: "text" as const, color: "#000", x: 3, y: 30, fontSize: 20, text: "old" };
    act(() => result.current.openEditorForLabel(label));
    act(() => result.current.setEditorText("new"));
    act(() => result.current.commitEditor());
    expect(callbacks.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "label-1", text: "new" }));
    act(() => result.current.openEditorForLabel(label));
    act(() => result.current.setEditorText("   "));
    act(() => result.current.commitEditor());
    expect(callbacks.onErase).toHaveBeenCalledWith("label-1");
  });

  it("cancels editing without committing and reports editing transitions", () => {
    const { result, callbacks } = setup();
    act(() => result.current.startNewEditor({ x: 1, y: 2 }, "text"));
    act(() => result.current.setEditorText("discard me"));
    act(() => result.current.cancelEditor());
    expect(callbacks.onCommit).not.toHaveBeenCalled();
    expect(callbacks.onTextEditingChange.mock.calls).toEqual([[true], [false]]);
    expect(result.current.editor).toBeNull();
  });

  it("cancels the pending focus RAF on unmount", () => {
    vi.useFakeTimers();
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const { result, unmount } = setup();
    act(() => result.current.startNewEditor({ x: 1, y: 2 }, "text"));
    unmount();
    expect(cancelFrame).toHaveBeenCalled();
  });
});
