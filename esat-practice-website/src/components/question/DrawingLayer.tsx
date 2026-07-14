import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  Annotation,
  AnnPoint,
  AnnTool,
  FreehandKind,
  ShapeKind,
} from "../../types/annotations";
import { clientToUser } from "./annotationGeometry";
import type { GetReplay } from "./drawing/annotationRenderers";
import { MathContent, renderAnnotation, renderFreehand, renderShape } from "./drawing/annotationRenderers";
import { useAnnotationReplay } from "./drawing/useAnnotationReplay";
import { useLabelEditor } from "./drawing/useLabelEditor";

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

type LiveFree = { mode: "free"; kind: FreehandKind; points: AnnPoint[]; width: number };
type LiveShape = { mode: "shape"; kind: ShapeKind; start: AnnPoint; end: AnnPoint };
// Tracks a text/math annotation being dragged. On pointer-up without movement, opens the editor.
type LiveLabelMove = {
  mode: "label-move";
  ann: Extract<Annotation, { kind: "text" | "math" }>;
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

// Committed annotations, isolated behind React.memo. During a live stroke only
// the parent re-renders (via forceTick); this subtree is skipped because none of
// its props change until an annotation is actually added/removed/edited — so the
// full set of strokes isn't re-serialized on every frame.
const CommittedAnnotations = memo(function CommittedAnnotations({
  annotations,
  getReplay,
  naturalWidth,
  editingId,
  draggedLabelId,
  eraserHoverId,
}: {
  annotations: Annotation[];
  getReplay: GetReplay;
  naturalWidth: number;
  editingId: string | null;
  draggedLabelId: string | null;
  eraserHoverId: string | null;
}) {
  return (
    <>
      {annotations.map((ann) =>
        renderAnnotation(ann, { getReplay, naturalWidth, editingId, draggedLabelId, eraserHoverId }),
      )}
    </>
  );
});

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
  const annotationsRef = useRef<Annotation[]>(annotations);
  annotationsRef.current = annotations;
  // The pen/highlighter cursor preview is driven imperatively (see
  // positionCursor) rather than via React state: a state update per pointermove
  // forces a full re-render of the whole annotation SVG, which on low-end
  // hardware makes the cursor visibly trail the real pointer.
  const cursorRef = useRef<SVGCircleElement>(null);
  const [eraserHoverId, setEraserHoverId] = useState<string | null>(null);

  const isDrawTool = tool !== "pan";
  const isCursorTool = tool === "pen" || tool === "highlighter";
  const fontSize = Math.max(Math.round(naturalSize.width * 0.032), 12);
  const moveThreshold = naturalSize.width * LABEL_MOVE_THRESHOLD;

  const { getReplay } = useAnnotationReplay(annotations, replayNonce);
  const {
    editor,
    editorText,
    editorKind,
    editingId,
    editorInputRef,
    setEditorText,
    openEditorForLabel,
    commitEditor,
    cancelEditor,
    startNewEditor,
  } = useLabelEditor({ color, fontSize, onCommit, onErase, onUpdate, onTextEditingChange });

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      forceTick((n) => n + 1);
    });
  }, []);

  // Move/show/hide the cursor preview circle by mutating the DOM directly.
  // Passing null hides it (e.g. on pointer-leave or while a freehand stroke is
  // in progress, when the live path stands in for the cursor).
  const positionCursor = useCallback((point: AnnPoint | null) => {
    const el = cursorRef.current;
    if (!el) return;
    if (point) {
      el.setAttribute("cx", String(point.x));
      el.setAttribute("cy", String(point.y));
      el.style.visibility = "visible";
    } else {
      el.style.visibility = "hidden";
    }
  }, []);

  // Cached inverse screen CTM for the current pointer interaction. getScreenCTM
  // flushes pending layout, so calling it on every pointermove (while drawing
  // also dirties the DOM each frame) means a forced synchronous reflow per
  // event. The transform is constant for the duration of an interaction — pan is
  // disabled while a draw tool is active and zoom needs a click that ends the
  // interaction — so we capture it once and reuse it, refreshing per stroke.
  const ctmRef = useRef<DOMMatrix | null>(null);
  const svgPointRef = useRef<DOMPoint | null>(null);

  const captureCtm = useCallback((svg: SVGSVGElement) => {
    // getScreenCTM is absent in jsdom (and can be unavailable for a detached
    // node); fall back to null so mapPoint uses clientToUser instead.
    const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
    ctmRef.current = ctm ? ctm.inverse() : null;
  }, []);

  const mapPoint = useCallback((svg: SVGSVGElement, clientX: number, clientY: number): AnnPoint => {
    const inv = ctmRef.current;
    if (inv) {
      let p = svgPointRef.current;
      if (!p) {
        p = svg.createSVGPoint();
        svgPointRef.current = p;
      }
      p.x = clientX;
      p.y = clientY;
      const mapped = p.matrixTransform(inv);
      return { x: mapped.x, y: mapped.y };
    }
    // No cached matrix (or getScreenCTM unavailable, e.g. jsdom) — compute fresh.
    return clientToUser(svg, clientX, clientY);
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    liveRef.current = null;
    erasingRef.current = false;
    positionCursor(null);
    setEraserHoverId(null);
    if ((!LABEL_TOOLS.includes(tool) || tool !== editorKind) && editor) {
      cancelEditor();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editorKind, tool]);

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

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!isDrawTool || event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    event.stopPropagation();

    // Refresh the cached transform at the start of each interaction.
    captureCtm(svg);
    const point = mapPoint(svg, event.clientX, event.clientY);

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
            commitEditor();
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
      startNewEditor(point, tool);
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
      // The live path takes over from the cursor preview for the stroke.
      positionCursor(null);
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
    // Hover moves have no preceding pointerdown to seed the cache; capture on
    // the first move and reuse it for the rest of the hover (cleared on leave).
    if (ctmRef.current === null) captureCtm(svg);
    const point = mapPoint(svg, event.clientX, event.clientY);

    if (isCursorTool) {
      // Hide the preview mid-stroke; the live freehand path stands in for it.
      positionCursor(liveRef.current?.mode === "free" ? null : point);
    }

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
    positionCursor(null);
    setEraserHoverId(null);
    // Invalidate the cached transform; the next interaction re-captures it.
    ctmRef.current = null;
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

  const live = liveRef.current;

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

      <CommittedAnnotations
        annotations={annotations}
        getReplay={getReplay}
        naturalWidth={naturalSize.width}
        editingId={editingId}
        draggedLabelId={live?.mode === "label-move" ? live.ann.id : null}
        eraserHoverId={eraserHoverId}
      />

      {live?.mode === "free" &&
        renderFreehand(getReplay, "__live", live.kind, live.points, color, live.width)}
      {live?.mode === "shape" &&
        renderShape(getReplay, naturalSize.width, "__live", live.kind, live.start, live.end, color, width)}

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

      {/* Cursor preview: mounted whenever a cursor tool is active, positioned and
          shown/hidden imperatively via positionCursor (starts hidden). */}
      {isCursorTool && (
        <circle
          ref={cursorRef}
          r={tool === "highlighter" ? width * 2 : width * 0.5}
          fill={color}
          fillOpacity={tool === "highlighter" ? 0.2 : 0.4}
          stroke={tool === "highlighter" ? color : "white"}
          strokeWidth={Math.max(0.5, width * 0.07)}
          strokeOpacity={tool === "highlighter" ? 0.35 : 0.7}
          style={{ pointerEvents: "none", visibility: "hidden" }}
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
              aria-label={editorKind === "math" ? "Math annotation" : "Text annotation"}
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
