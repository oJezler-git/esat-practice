import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Annotation, AnnTool } from "../../types/annotations";
import { DrawingLayer } from "./DrawingLayer";

vi.mock("./annotationGeometry", async () => {
  const actual = await vi.importActual<typeof import("./annotationGeometry")>("./annotationGeometry");
  return { ...actual, clientToUser: (_svg: SVGSVGElement, x: number, y: number) => ({ x, y }) };
});

const pen: Annotation = { id: "pen-existing", kind: "pen", color: "#111", width: 4, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] };
const label: Annotation = { id: "label-existing", kind: "text", color: "#111", x: 30, y: 50, fontSize: 20, text: "old" };

function setup(tool: AnnTool, annotations: Annotation[] = []) {
  const callbacks = { onCommit: vi.fn(), onErase: vi.fn(), onUpdate: vi.fn(), onTextEditingChange: vi.fn() };
  const view = render(<DrawingLayer naturalSize={{ width: 1000, height: 600 }} tool={tool} color="#1570ef" width={4} annotations={annotations} {...callbacks} />);
  const svg = view.container.querySelector("svg") as SVGSVGElement;
  Object.assign(svg, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
  return { ...view, svg, callbacks };
}

describe("DrawingLayer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a pen stroke and releases pointer capture", () => {
    const { svg, callbacks } = setup("pen");
    fireEvent.pointerDown(svg, { button: 0, pointerId: 7, clientX: 10, clientY: 15, pressure: 0.5 });
    fireEvent.pointerMove(svg, { pointerId: 7, clientX: 40, clientY: 45, buttons: 1 });
    fireEvent.pointerUp(svg, { pointerId: 7, clientX: 40, clientY: 45 });
    expect(svg.setPointerCapture).toHaveBeenCalledWith(7);
    expect(svg.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(callbacks.onCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: "pen", color: "#1570ef", points: [{ x: 10, y: 15 }, { x: 40, y: 45 }] }));
  });

  it("deletes an annotation with the eraser", () => {
    const { container, callbacks } = setup("eraser", [pen]);
    fireEvent.pointerDown(container.querySelector('[data-ann-id="pen-existing"]')!, { button: 0, pointerId: 2, clientX: 15, clientY: 15 });
    expect(callbacks.onErase).toHaveBeenCalledWith("pen-existing");
  });

  it("cancels a new label with Escape and edits an existing label", () => {
    const first = setup("text");
    fireEvent.pointerDown(first.svg, { button: 0, pointerId: 1, clientX: 25, clientY: 30 });
    const input = screen.getByRole("textbox", { name: "Text annotation" });
    fireEvent.change(input, { target: { value: "cancelled" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(first.callbacks.onCommit).not.toHaveBeenCalled();
    expect(first.callbacks.onTextEditingChange.mock.calls).toEqual([[true], [false]]);
    first.unmount();

    const second = setup("text", [label]);
    fireEvent.pointerDown(second.container.querySelector('[data-ann-id="label-existing"]')!, { button: 0, pointerId: 3, clientX: 30, clientY: 50 });
    fireEvent.pointerUp(second.svg, { pointerId: 3, clientX: 30, clientY: 50 });
    const editInput = screen.getByRole("textbox", { name: "Text annotation" });
    fireEvent.change(editInput, { target: { value: "new label" } });
    fireEvent.keyDown(editInput, { key: "Enter" });
    expect(second.callbacks.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "label-existing", text: "new label" }));
    expect(second.svg.releasePointerCapture).toHaveBeenCalledWith(3);
  });
});
