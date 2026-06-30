import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement } from "react";
import katex from "katex";
import type {
  Annotation,
  AnnPoint,
  AnnTool,
  FreehandKind,
  MathAnnotation,
  ShapeKind,
  TextAnnotation,
} from "../../types/annotations";
import {
  arrowHeadPath,
  buildSmoothPath,
  clientToUser,
  ellipseAttrs,
  rectAttrs,
  replayTiming,
} from "./annotationGeometry";

type LabelAnnotation = TextAnnotation | MathAnnotation;

/** Renders a LaTeX source string to KaTeX HTML. Falls back to raw source on parse error. */
function MathContent({
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

interface Props {
  naturalSize: { width: number; height: number };
  tool: AnnTool;
  color: string;
  width: number;
  annotations: Annotation[];
  onCommit: (annotation: Annotation) => void;
  onErase: (id: string) => void;
  onUpdate: (annotation: Annotation) => void;
  onTextEditingChange?: (editing: boolean) => void;
  /**
   * Bumped each time annotations are (re)loaded from storage. A change triggers a
   * fast staggered "draw-in" replay of the loaded strokes; freshly drawn strokes
   * (which don't change the nonce) appear instantly.
   */
  replayNonce?: number;
}

type ReplayState = { order: Map<string, number>; step: number; dur: number };

type LiveFree = { mode: "free"; kind: FreehandKind; points: AnnPoint[]; width: number };
type LiveShape = { mode: "shape"; kind: ShapeKind; start: AnnPoint; end: AnnPoint };
// Tracks a text/math annotation being dragged. On pointer-up without movement, opens the editor.
type LiveLabelMove = {
  mode: "label-move";
  ann: LabelAnnotation;
  x: number; y: number;  // current origin position in SVG user coords
  offsetX: number; offsetY: number;  // click offset from the annotation's origin
  moved: boolean;
};
type Live = LiveFree | LiveShape | LiveLabelMove | null;

const FREEHAND_TOOLS: AnnTool[] = ["pen", "highlighter"];
const SHAPE_TOOLS: AnnTool[] = ["line", "arrow", "rect", "ellipse"];
const LABEL_TOOLS: AnnTool[] = ["text", "math"];
// Minimum drag distance (as fraction of natural image width) before a text/math
// pointer-down is treated as a move rather than a click-to-edit.
const LABEL_MOVE_THRESHOLD = 0.006;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shiftConstrain(start: AnnPoint, end: AnnPoint, kind: ShapeKind): AnnPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (kind === "rect" || kind === "ellipse") {
    const size = Math.min(Math.abs(dx), Math.abs(dy));
    return { x: start.x + Math.sign(dx) * size, y: start.y + Math.sign(dy) * size };
  }
  // line / arrow: snap to nearest 10°
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 18)) * (Math.PI / 18);
  const dist = Math.hypot(dx, dy);
  return { x: start.x + Math.cos(snapped) * dist, y: start.y + Math.sin(snapped) * dist };
}

export function DrawingLayer({
  naturalSize,
  tool,
  color,
  width,
  annotations,
  onCommit,
  onErase,
  onUpdate,
  onTextEditingChange,
  replayNonce = 0,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<Live>(null);
  const erasingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const [, forceTick] = useState(0);
  const [editor, setEditor] = useState<{ x: number; y: number } | null>(null);
  const [editorText, setEditorText] = useState("");
  // Which kind of label the open editor is creating/editing: plain text or LaTeX math.
  const [editorKind, setEditorKind] = useState<"text" | "math">("text");
  // Non-null when editing an *existing* annotation (so commit calls onUpdate/onErase).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editorInputRef = useRef<HTMLInputElement>(null);
  const [replay, setReplay] = useState<ReplayState | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const annotationsRef = useRef<Annotation[]>(annotations);
  annotationsRef.current = annotations;
  const [cursorPos, setCursorPos] = useState<AnnPoint | null>(null);
  const [eraserHoverId, setEraserHoverId] = useState<string | null>(null);

  const isDrawTool = tool !== "pan";
  const isCursorTool = tool === "pen" || tool === "highlighter";
  const fontSize = Math.max(Math.round(naturalSize.width * 0.032), 12);
  const moveThreshold = naturalSize.width * LABEL_MOVE_THRESHOLD;

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      forceTick((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (replayTimerRef.current !== null) window.clearTimeout(replayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (replayNonce <= 0) return;
    if (replayTimerRef.current !== null) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    const items = annotationsRef.current;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (items.length === 0 || prefersReduced) {
      setReplay(null);
      return;
    }

    const order = new Map<string, number>();
    items.forEach((ann, index) => order.set(ann.id, index));
    const { step, dur, total } = replayTiming(items.length);

    setReplay({ order, step, dur });
    replayTimerRef.current = window.setTimeout(() => {
      setReplay(null);
      replayTimerRef.current = null;
    }, total);
  }, [replayNonce]);

  const getReplay = (id: string): { delay: number; dur: number } | null => {
    if (!replay) return null;
    const index = replay.order.get(id);
    if (index === undefined) return null;
    return { delay: index * replay.step, dur: replay.dur };
  };

  const replayStrokeProps = (
    id: string,
    extraStyle?: CSSProperties,
  ): { pathLength?: number; className?: string; style?: CSSProperties } => {
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
  };

  useEffect(() => {
    liveRef.current = null;
    erasingRef.current = false;
    setCursorPos(null);
    setEraserHoverId(null);
    if ((!LABEL_TOOLS.includes(tool) || tool !== editorKind) && editor) {
      setEditor(null);
      setEditorText("");
      setEditingId(null);
      onTextEditingChange?.(false);
    }
  }, [editor, editorKind, onTextEditingChange, tool]);

  useEffect(() => {
    if (editor) {
      const id = window.requestAnimationFrame(() => editorInputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [editor]);

  const eraseAt = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      // closest() handles math labels, whose hit target is a nested KaTeX span
      // inside the foreignObject rather than the element carrying data-ann-id.
      const id = target.closest("[data-ann-id]")?.getAttribute("data-ann-id");
      if (id) onErase(id);
    },
    [onErase],
  );

  const openEditorForLabel = useCallback(
    (ann: LabelAnnotation) => {
      if (ann.kind === "text") {
        // editor.y is the top of the foreignObject; baseline = editor.y + fontSize
        setEditor({ x: ann.x, y: ann.y - ann.fontSize });
        setEditorText(ann.text);
      } else {
        setEditor({ x: ann.x, y: ann.y });
        setEditorText(ann.latex);
      }
      setEditingId(ann.id);
      setEditorKind(ann.kind);
      onTextEditingChange?.(true);
    },
    [onTextEditingChange],
  );

  const commitEditor = useCallback(() => {
    if (!editor) return;
    const text = editorText.trim();
    if (editingId) {
      // Updating an existing annotation: empty text deletes it.
      if (text) {
        onUpdate(
          editorKind === "math"
            ? { id: editingId, kind: "math", color, x: editor.x, y: editor.y, fontSize, latex: text }
            : { id: editingId, kind: "text", color, x: editor.x, y: editor.y + fontSize, fontSize, text },
        );
      } else {
        onErase(editingId);
      }
    } else {
      if (text) {
        onCommit(
          editorKind === "math"
            ? { id: newId(), kind: "math", color, x: editor.x, y: editor.y, fontSize, latex: text }
            : { id: newId(), kind: "text", color, x: editor.x, y: editor.y + fontSize, fontSize, text },
        );
      }
    }
    setEditor(null);
    setEditorText("");
    setEditingId(null);
    onTextEditingChange?.(false);
  }, [color, editingId, editor, editorKind, editorText, fontSize, onCommit, onErase, onUpdate, onTextEditingChange]);

  const cancelEditor = useCallback(() => {
    setEditor(null);
    setEditorText("");
    setEditingId(null);
    onTextEditingChange?.(false);
  }, [onTextEditingChange]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!isDrawTool || event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    event.stopPropagation();

    const point = clientToUser(svg, event.clientX, event.clientY);

    if (tool === "text" || tool === "math") {
      // Check if the pointer landed on an existing annotation of the same kind.
      const target = event.target;
      if (target instanceof Element) {
        // closest() handles math labels, whose hit target is a nested KaTeX
        // span inside the foreignObject rather than the element carrying data-ann-id.
        const id = target.closest("[data-ann-id]")?.getAttribute("data-ann-id");
        if (id) {
          const ann = annotationsRef.current.find((a) => a.id === id);
          if (ann?.kind === tool) {
            // Commit any open editor first.
            if (editor) commitEditor();
            // Start drag tracking; if pointer barely moves, open the editor on up.
            svg.setPointerCapture(event.pointerId);
            activePointerRef.current = event.pointerId;
            liveRef.current = {
              mode: "label-move",
              ann,
              x: ann.x,
              y: ann.y,
              offsetX: point.x - ann.x,
              offsetY: point.y - ann.y,
              moved: false,
            };
            scheduleRender();
            return;
          }
        }
      }
      // Empty-area click: commit any open editor, then open a new one.
      if (editor) commitEditor();
      setEditor({ x: point.x, y: point.y });
      setEditorText("");
      setEditingId(null);
      setEditorKind(tool);
      onTextEditingChange?.(true);
      return;
    }

    if (tool === "eraser") {
      erasingRef.current = true;
      setEraserHoverId(null);
      eraseAt(event.target);
      return;
    }

    svg.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;

    if (FREEHAND_TOOLS.includes(tool)) {
      const pressure = event.pressure > 0 ? event.pressure : 0.5;
      const strokeWidth =
        tool === "pen" ? width * (0.55 + 0.9 * pressure) : width * 4;
      liveRef.current = {
        mode: "free",
        kind: tool as FreehandKind,
        points: [point],
        width: strokeWidth,
      };
    } else if (SHAPE_TOOLS.includes(tool)) {
      liveRef.current = {
        mode: "shape",
        kind: tool as ShapeKind,
        start: point,
        end: point,
      };
    }
    scheduleRender();
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const point = clientToUser(svg, event.clientX, event.clientY);

    if (isCursorTool) setCursorPos(point);

    if (tool === "eraser") {
      if (erasingRef.current && event.buttons === 1) {
        eraseAt(event.target);
        setEraserHoverId(null);
      } else if (event.buttons === 0) {
        erasingRef.current = false;
        const id =
          event.target instanceof Element
            ? event.target.closest("[data-ann-id]")?.getAttribute("data-ann-id") ?? null
            : null;
        setEraserHoverId(id);
      } else {
        setEraserHoverId(null);
      }
      return;
    }

    const live = liveRef.current;
    if (!live || activePointerRef.current !== event.pointerId) return;

    if (live.mode === "label-move") {
      const newX = point.x - live.offsetX;
      const newY = point.y - live.offsetY;
      if (!live.moved && Math.hypot(newX - live.ann.x, newY - live.ann.y) >= moveThreshold) {
        live.moved = true;
      }
      live.x = newX;
      live.y = newY;
      scheduleRender();
      return;
    }

    if (live.mode === "free") {
      const last = live.points[live.points.length - 1];
      const minDist = Math.max(naturalSize.width * 0.0015, 1);
      if (Math.hypot(point.x - last.x, point.y - last.y) >= minDist) {
        live.points.push(point);
        scheduleRender();
      }
    } else if (live.mode === "shape") {
      live.end = event.shiftKey ? shiftConstrain(live.start, point, live.kind) : point;
      scheduleRender();
    }
  };

  const handlePointerLeave = () => {
    setCursorPos(null);
    setEraserHoverId(null);
  };

  const finishStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === "eraser") {
      erasingRef.current = false;
      return;
    }
    const live = liveRef.current;
    const svg = svgRef.current;
    if (svg && activePointerRef.current === event.pointerId) {
      try {
        svg.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
    }
    activePointerRef.current = null;

    if (live) {
      if (live.mode === "label-move") {
        if (live.moved) {
          onUpdate({ ...live.ann, x: live.x, y: live.y });
        } else {
          // Tap without drag → open editor for the annotation.
          openEditorForLabel(live.ann);
        }
      } else if (live.mode === "free" && live.points.length >= 1) {
        onCommit({
          id: newId(),
          kind: live.kind,
          color,
          width: live.width,
          points: live.points,
        });
      } else if (live.mode === "shape") {
        const dist = Math.hypot(live.end.x - live.start.x, live.end.y - live.start.y);
        if (dist >= naturalSize.width * 0.01) {
          onCommit({
            id: newId(),
            kind: live.kind,
            color,
            width,
            start: live.start,
            end: live.end,
          });
        }
      }
    }
    liveRef.current = null;
    scheduleRender();
  };

  const renderFreehand = (
    id: string,
    kind: FreehandKind,
    points: AnnPoint[],
    strokeColor: string,
    strokeWidth: number,
    isEraseTarget = false,
  ) => {
    const replayProps = replayStrokeProps(
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
  };

  const renderShape = (
    id: string,
    kind: ShapeKind,
    start: AnnPoint,
    end: AnnPoint,
    strokeColor: string,
    strokeWidth: number,
    isEraseTarget = false,
  ) => {
    const common = {
      "data-ann-id": id,
      fill: "none",
      stroke: strokeColor,
      strokeWidth,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
    };
    const replayProps = replayStrokeProps(id);
    if (kind === "rect") {
      return <rect key={id} {...common} {...rectAttrs(start, end)} rx={Math.min(strokeWidth, 6)} opacity={isEraseTarget ? 0.3 : undefined} {...replayProps} />;
    }
    if (kind === "ellipse") {
      return <ellipse key={id} {...common} {...ellipseAttrs(start, end)} opacity={isEraseTarget ? 0.3 : undefined} {...replayProps} />;
    }
    const headSize = Math.max(strokeWidth * 3.5, naturalSize.width * 0.018);
    return (
      <g key={id} opacity={isEraseTarget ? 0.3 : undefined}>
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...common} {...replayProps} />
        {kind === "arrow" && <path d={arrowHeadPath(start, end, headSize)} {...common} {...replayProps} />}
      </g>
    );
  };

  const live = liveRef.current;

  const renderAnnotation = (ann: Annotation): ReactElement | null => {
    // Hide a text/math label that is currently open in the editor or being dragged.
    if (
      (ann.kind === "text" || ann.kind === "math") &&
      (ann.id === editingId || (live?.mode === "label-move" && live.ann.id === ann.id))
    ) {
      return null;
    }

    const eraseTarget = ann.id === eraserHoverId;
    switch (ann.kind) {
      case "pen":
      case "highlighter":
        return renderFreehand(ann.id, ann.kind, ann.points, ann.color, ann.width, eraseTarget);
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
            width={Math.max(naturalSize.width - ann.x, 1)}
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
        return renderShape(ann.id, ann.kind, ann.start, ann.end, ann.color, ann.width, eraseTarget);
    }
  };

  // Editor width: cap at 45%/60% of image so it's not a full-width bar, but
  // ensure it doesn't spill past the right edge of the image. The math
  // preview itself isn't bound by this — it's allowed to overflow sideways
  // (no wrap, no clip) so long expressions stay on one legible line.
  const editorWidth = editor
    ? Math.min(naturalSize.width * (editorKind === "math" ? 0.6 : 0.45), naturalSize.width - editor.x)
    : 0;
  const editorHeight = editorKind === "math" ? fontSize * 4.2 : fontSize * 1.8;

  return (
    <svg
      ref={svgRef}
      className={`drawing-svg ${isDrawTool ? "drawing-svg-active" : ""}`}
      viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
      preserveAspectRatio="none"
      data-tool={tool}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      onPointerLeave={handlePointerLeave}
    >
      {/* Faint crosshair guides shown only while drawing an arrow. */}
      {live?.mode === "shape" && live.kind === "arrow" && (
        <>
          <line
            x1={0}
            y1={live.start.y}
            x2={naturalSize.width}
            y2={live.start.y}
            stroke={color}
            strokeWidth={Math.max(0.5, width * 0.12)}
            strokeOpacity={0.22}
            strokeDasharray={`${Math.max(4, width * 2.5)} ${Math.max(3, width * 1.5)}`}
            style={{ pointerEvents: "none" }}
          />
          <line
            x1={live.start.x}
            y1={0}
            x2={live.start.x}
            y2={naturalSize.height}
            stroke={color}
            strokeWidth={Math.max(0.5, width * 0.12)}
            strokeOpacity={0.22}
            strokeDasharray={`${Math.max(4, width * 2.5)} ${Math.max(3, width * 1.5)}`}
            style={{ pointerEvents: "none" }}
          />
        </>
      )}

      {annotations.map(renderAnnotation)}

      {live?.mode === "free" &&
        renderFreehand("__live", live.kind, live.points, color, live.width)}
      {live?.mode === "shape" &&
        renderShape("__live", live.kind, live.start, live.end, color, width)}

      {/* Text/math annotation being dragged: render at the live position. */}
      {live?.mode === "label-move" && live.ann.kind === "text" && (
        <text
          x={live.x}
          y={live.y}
          fill={live.ann.color}
          fontSize={live.ann.fontSize}
          className="drawing-text"
          style={{ pointerEvents: "none", opacity: 0.75 }}
        >
          {live.ann.text}
        </text>
      )}
      {live?.mode === "label-move" && live.ann.kind === "math" && (
        <foreignObject
          x={live.x}
          y={live.y}
          width={Math.max(naturalSize.width - live.x, 1)}
          height={live.ann.fontSize * 3}
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div className="drawing-math" style={{ opacity: 0.75 }}>
            <MathContent latex={live.ann.latex} color={live.ann.color} fontSize={live.ann.fontSize} />
          </div>
        </foreignObject>
      )}

      {isCursorTool && cursorPos && live?.mode !== "free" && (
        <circle
          cx={cursorPos.x}
          cy={cursorPos.y}
          r={tool === "highlighter" ? width * 2 : width * 0.5}
          fill={color}
          fillOpacity={tool === "highlighter" ? 0.2 : 0.4}
          stroke={tool === "highlighter" ? color : "white"}
          strokeWidth={Math.max(0.5, width * 0.07)}
          strokeOpacity={tool === "highlighter" ? 0.35 : 0.7}
          style={{ pointerEvents: "none" }}
        />
      )}

      {editor && (
        <foreignObject
          x={editor.x}
          y={editor.y}
          width={editorWidth}
          height={editorHeight}
          style={{ overflow: "visible" }}
        >
          <div className={editorKind === "math" ? "drawing-math-editor" : undefined}>
            <input
              ref={editorInputRef}
              className="drawing-text-input"
              value={editorText}
              placeholder={editorKind === "math" ? "\\frac{1}{2}" : undefined}
              style={{ color, fontSize: `${fontSize}px`, height: `${fontSize * 1.5}px` }}
              onChange={(e) => setEditorText(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEditor();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelEditor();
                }
              }}
              onBlur={commitEditor}
            />
            {editorKind === "math" && editorText.trim() && (
              <div className="drawing-math-preview">
                <MathContent latex={editorText} color={color} fontSize={fontSize} />
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
