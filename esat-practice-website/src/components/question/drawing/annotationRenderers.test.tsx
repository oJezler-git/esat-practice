import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import type { Annotation } from "../../../types/annotations";
import { MathContent, renderAnnotation, type GetReplay } from "./annotationRenderers";

const noReplay: GetReplay = () => null;
const withReplay: GetReplay = () => ({ delay: 120, dur: 400 });

const baseCtx = {
  getReplay: noReplay,
  naturalWidth: 1000,
  editingId: null,
  draggedLabelId: null,
  eraserHoverId: null,
};

function renderInSvg(el: ReactElement | null) {
  return render(<svg>{el}</svg>);
}

const pen: Annotation = {
  id: "pen-1",
  kind: "pen",
  color: "#d92d20",
  width: 3,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 0 },
  ],
};

describe("renderAnnotation", () => {
  it("renders a pen stroke as a smooth full-opacity path", () => {
    const { container } = renderInSvg(renderAnnotation(pen, baseCtx));
    const path = container.querySelector('[data-ann-id="pen-1"]')!;
    expect(path.tagName).toBe("path");
    expect(path).toHaveAttribute("stroke", "#d92d20");
    expect(path).toHaveAttribute("stroke-opacity", "1");
    expect(path.getAttribute("d")).toContain("M 0 0");
  });

  it("renders a highlighter stroke translucent with multiply blending", () => {
    const { container } = renderInSvg(
      renderAnnotation({ ...pen, id: "hl-1", kind: "highlighter" }, baseCtx),
    );
    const path = container.querySelector('[data-ann-id="hl-1"]')!;
    expect(path).toHaveAttribute("stroke-opacity", "0.35");
    expect((path as SVGElement).style.mixBlendMode).toBe("multiply");
  });

  it("attaches replay timing custom properties when a replay is active", () => {
    const { container } = renderInSvg(
      renderAnnotation(pen, { ...baseCtx, getReplay: withReplay }),
    );
    const path = container.querySelector('[data-ann-id="pen-1"]') as SVGElement;
    expect(path).toHaveClass("drawing-replay-stroke");
    expect(path).toHaveAttribute("pathLength", "1");
    expect(path.style.getPropertyValue("--replay-delay")).toBe("120ms");
    expect(path.style.getPropertyValue("--replay-dur")).toBe("400ms");
  });

  it("dims the annotation targeted by the eraser", () => {
    const { container } = renderInSvg(
      renderAnnotation(pen, { ...baseCtx, eraserHoverId: "pen-1" }),
    );
    expect(container.querySelector('[data-ann-id="pen-1"]')).toHaveAttribute("opacity", "0.3");
  });

  it("renders a rect shape with normalised geometry (drag in any direction)", () => {
    const rect: Annotation = {
      id: "r1",
      kind: "rect",
      color: "#1570ef",
      width: 2,
      start: { x: 50, y: 40 },
      end: { x: 10, y: 20 },
    };
    const { container } = renderInSvg(renderAnnotation(rect, baseCtx));
    const el = container.querySelector('[data-ann-id="r1"]')!;
    expect(el.tagName).toBe("rect");
    expect(el).toHaveAttribute("x", "10");
    expect(el).toHaveAttribute("y", "20");
    expect(el).toHaveAttribute("width", "40");
    expect(el).toHaveAttribute("height", "20");
    expect(el).toHaveAttribute("rx", "2");
  });

  it("renders an ellipse centred between start and end", () => {
    const ellipse: Annotation = {
      id: "e1",
      kind: "ellipse",
      color: "#0a8754",
      width: 2,
      start: { x: 0, y: 0 },
      end: { x: 100, y: 50 },
    };
    const { container } = renderInSvg(renderAnnotation(ellipse, baseCtx));
    const el = container.querySelector('[data-ann-id="e1"]')!;
    expect(el.tagName).toBe("ellipse");
    expect(el).toHaveAttribute("cx", "50");
    expect(el).toHaveAttribute("cy", "25");
    expect(el).toHaveAttribute("rx", "50");
    expect(el).toHaveAttribute("ry", "25");
  });

  it("renders a line without an arrowhead and an arrow with one", () => {
    const line: Annotation = {
      id: "l1",
      kind: "line",
      color: "#1f2933",
      width: 2,
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    };
    const { container: lineContainer } = renderInSvg(renderAnnotation(line, baseCtx));
    expect(lineContainer.querySelectorAll('[data-ann-id="l1"]')).toHaveLength(1);
    expect(lineContainer.querySelector("line")).toHaveAttribute("x2", "100");

    const { container: arrowContainer } = renderInSvg(
      renderAnnotation({ ...line, id: "a1", kind: "arrow" }, baseCtx),
    );
    expect(arrowContainer.querySelector("line")).toBeInTheDocument();
    expect(arrowContainer.querySelector("path")).toBeInTheDocument();
  });

  it("renders a text label and hides it while it is being edited or dragged", () => {
    const text: Annotation = {
      id: "t1",
      kind: "text",
      color: "#1f2933",
      x: 30,
      y: 60,
      fontSize: 24,
      text: "note to self",
    };
    const { container } = renderInSvg(renderAnnotation(text, baseCtx));
    const el = container.querySelector('[data-ann-id="t1"]')!;
    expect(el.tagName).toBe("text");
    expect(el).toHaveTextContent("note to self");
    expect(el).toHaveAttribute("x", "30");

    expect(renderAnnotation(text, { ...baseCtx, editingId: "t1" })).toBeNull();
    expect(renderAnnotation(text, { ...baseCtx, draggedLabelId: "t1" })).toBeNull();
  });

  it("applies the replay fade to a text label", () => {
    const text: Annotation = {
      id: "t2",
      kind: "text",
      color: "#1f2933",
      x: 0,
      y: 0,
      fontSize: 20,
      text: "fades in",
    };
    const { container } = renderInSvg(
      renderAnnotation(text, { ...baseCtx, getReplay: withReplay }),
    );
    const el = container.querySelector('[data-ann-id="t2"]') as SVGElement;
    expect(el).toHaveClass("drawing-replay-fade");
    expect(el.style.getPropertyValue("--replay-delay")).toBe("120ms");
  });

  it("renders a math label as KaTeX inside a foreignObject sized to the scan", () => {
    const math: Annotation = {
      id: "m1",
      kind: "math",
      color: "#7c3aed",
      x: 200,
      y: 100,
      fontSize: 20,
      latex: "x^2 + 1",
    };
    const { container } = renderInSvg(renderAnnotation(math, { ...baseCtx, editingId: "other" }));
    const fo = container.querySelector("foreignObject")!;
    expect(fo).toHaveAttribute("x", "200");
    expect(fo).toHaveAttribute("width", "800"); // naturalWidth - x
    expect(fo).toHaveAttribute("height", "60"); // fontSize * 3
    expect(fo.querySelector(".katex")).toBeInTheDocument();

    expect(renderAnnotation(math, { ...baseCtx, editingId: "m1" })).toBeNull();
  });
});

describe("MathContent", () => {
  it("renders KaTeX HTML with the requested colour and size", () => {
    const { container } = render(
      <MathContent latex="\frac{1}{2}" color="#d92d20" fontSize={18} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.color).toBe("rgb(217, 45, 32)");
    expect(root.style.fontSize).toBe("18px");
    expect(root.querySelector(".katex")).toBeInTheDocument();
  });

  it("falls back to raw source for unparseable input", () => {
    // katex with throwOnError: false renders errors in-place, so the fallback
    // branch is only about hard throws; either way the source text survives.
    const { container } = render(
      <MathContent latex={"\\undefinedmacro{"} color="#000" fontSize={16} />,
    );
    expect(container.textContent).toContain("\\undefinedmacro{");
  });
});
