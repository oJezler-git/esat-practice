import { useMemo } from "react";
import type { CSSProperties, ReactElement } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Annotation, AnnPoint, FreehandKind, ShapeKind } from "../../../types/annotations";
import { arrowHeadPath, buildSmoothPath, ellipseAttrs, rectAttrs } from "../annotationGeometry";

/** Renders a LaTeX source string to KaTeX HTML. Falls back to raw source on parse error. */
export function MathContent({
  latex,
  color,
  fontSize,
}: {
  latex: string;
  color: string;
  fontSize: number;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { throwOnError: false, output: "html" });
    } catch {
      return latex;
    }
  }, [latex]);
  return (
    <div
      style={{ color, fontSize: `${fontSize}px`, display: "inline-block", lineHeight: 1.25 }}
      // eslint-disable-next-line react/no-danger -- KaTeX output is generated locally, not user-supplied HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export type GetReplay = (id: string) => { delay: number; dur: number } | null;

function replayStrokeProps(
  getReplay: GetReplay,
  id: string,
  extraStyle?: CSSProperties,
): { pathLength?: number; className?: string; style?: CSSProperties } {
  const rp = getReplay(id);
  if (!rp) return { style: extraStyle };
  return {
    pathLength: 1,
    className: "drawing-replay-stroke",
    style: {
      ...extraStyle,
      ["--replay-delay" as string]: `${rp.delay}ms`,
      ["--replay-dur" as string]: `${rp.dur}ms`,
    } as CSSProperties,
  };
}

export function renderFreehand(
  getReplay: GetReplay,
  id: string,
  kind: FreehandKind,
  points: AnnPoint[],
  strokeColor: string,
  strokeWidth: number,
  isEraseTarget = false,
): ReactElement {
  const replayProps = replayStrokeProps(
    getReplay,
    id,
    kind === "highlighter" ? { mixBlendMode: "multiply" } : undefined,
  );
  return (
    <path
      key={id}
      data-ann-id={id}
      d={buildSmoothPath(points)}
      fill="none"
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity={kind === "highlighter" ? 0.35 : 1}
      opacity={isEraseTarget ? 0.3 : undefined}
      {...replayProps}
    />
  );
}

export function renderShape(
  getReplay: GetReplay,
  naturalWidth: number,
  id: string,
  kind: ShapeKind,
  start: AnnPoint,
  end: AnnPoint,
  strokeColor: string,
  strokeWidth: number,
  isEraseTarget = false,
): ReactElement {
  const common = {
    "data-ann-id": id,
    fill: "none",
    stroke: strokeColor,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const replayProps = replayStrokeProps(getReplay, id);
  if (kind === "rect") {
    return <rect key={id} {...common} {...rectAttrs(start, end)} rx={Math.min(strokeWidth, 6)} opacity={isEraseTarget ? 0.3 : undefined} {...replayProps} />;
  }
  if (kind === "ellipse") {
    return <ellipse key={id} {...common} {...ellipseAttrs(start, end)} opacity={isEraseTarget ? 0.3 : undefined} {...replayProps} />;
  }
  const headSize = Math.max(strokeWidth * 3.5, naturalWidth * 0.018);
  return (
    <g key={id} opacity={isEraseTarget ? 0.3 : undefined}>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...common} {...replayProps} />
      {kind === "arrow" && <path d={arrowHeadPath(start, end, headSize)} {...common} {...replayProps} />}
    </g>
  );
}

interface RenderAnnotationCtx {
  getReplay: GetReplay;
  naturalWidth: number;
  editingId: string | null;
  draggedLabelId: string | null;
  eraserHoverId: string | null;
}

export function renderAnnotation(ann: Annotation, ctx: RenderAnnotationCtx): ReactElement | null {
  const { getReplay, naturalWidth, editingId, draggedLabelId, eraserHoverId } = ctx;

  // Hide a text/math label that is currently open in the editor or being dragged.
  if ((ann.kind === "text" || ann.kind === "math") && (ann.id === editingId || ann.id === draggedLabelId)) {
    return null;
  }

  const eraseTarget = ann.id === eraserHoverId;
  switch (ann.kind) {
    case "pen":
    case "highlighter":
      return renderFreehand(getReplay, ann.id, ann.kind, ann.points, ann.color, ann.width, eraseTarget);
    case "text": {
      const rp = getReplay(ann.id);
      return (
        <text
          key={ann.id}
          data-ann-id={ann.id}
          x={ann.x}
          y={ann.y}
          fill={ann.color}
          fontSize={ann.fontSize}
          opacity={eraseTarget ? 0.3 : undefined}
          className={`drawing-text${rp ? " drawing-replay-fade" : ""}`}
          style={
            rp
              ? ({ ["--replay-delay" as string]: `${rp.delay}ms` } as CSSProperties)
              : undefined
          }
        >
          {ann.text}
        </text>
      );
    }
    case "math": {
      const rp = getReplay(ann.id);
      return (
        <foreignObject
          key={ann.id}
          data-ann-id={ann.id}
          x={ann.x}
          y={ann.y}
          width={Math.max(naturalWidth - ann.x, 1)}
          height={ann.fontSize * 3}
          style={{ overflow: "visible" }}
        >
          <div
            data-ann-id={ann.id}
            className={`drawing-math${rp ? " drawing-replay-fade" : ""}`}
            style={
              {
                opacity: eraseTarget ? 0.3 : undefined,
                ...(rp ? { ["--replay-delay" as string]: `${rp.delay}ms` } : {}),
              } as CSSProperties
            }
          >
            <MathContent latex={ann.latex} color={ann.color} fontSize={ann.fontSize} />
          </div>
        </foreignObject>
      );
    }
    default:
      return renderShape(getReplay, naturalWidth, ann.id, ann.kind, ann.start, ann.end, ann.color, ann.width, eraseTarget);
  }
}
