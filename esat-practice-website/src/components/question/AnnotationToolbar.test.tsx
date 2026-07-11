import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationToolbar } from "./AnnotationToolbar";

function renderToolbar(overrides: Partial<React.ComponentProps<typeof AnnotationToolbar>> = {}) {
  const props: React.ComponentProps<typeof AnnotationToolbar> = {
    tool: "pan",
    onToolChange: vi.fn(),
    palette: ["#111111", "#222222"],
    color: "#111111",
    onColorChange: vi.fn(),
    widthPresets: [2, 4, 8],
    width: 4,
    onWidthChange: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  return { ...render(<AnnotationToolbar {...props} />), props };
}

describe("AnnotationToolbar", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("switches tools and exposes the active tool", () => {
    const { props, rerender } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Pen" }));
    expect(props.onToolChange).toHaveBeenCalledWith("pen");

    rerender(<AnnotationToolbar {...props} tool="pen" />);
    expect(screen.getByRole("button", { name: "Pen" })).toHaveAttribute("aria-pressed", "true");
  });

  it("selects colours and stroke widths", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Colour #222222" }));
    fireEvent.click(screen.getByRole("button", { name: "Thick stroke" }));
    expect(props.onColorChange).toHaveBeenCalledWith("#222222");
    expect(props.onWidthChange).toHaveBeenCalledWith(8);
    expect(screen.getByRole("button", { name: "Medium stroke" })).toHaveAttribute("aria-pressed", "true");
  });

  it("disables unavailable undo and redo actions", () => {
    const { props, rerender } = renderToolbar();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    rerender(<AnnotationToolbar {...props} canUndo canRedo />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(props.onUndo).toHaveBeenCalledOnce();
    expect(props.onRedo).toHaveBeenCalledOnce();
  });

  it("requires a second clear click and resets confirmation after its timeout", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Clear all annotations" }));
    expect(props.onClear).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Confirm clear all annotations" });
    fireEvent.click(confirm);
    expect(props.onClear).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Clear all annotations" }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("button", { name: "Clear all annotations" })).toBeInTheDocument();
  });
});
