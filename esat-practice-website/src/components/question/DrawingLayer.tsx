import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type {
  Annotation,
  AnnPoint,
  AnnTool,
  FreehandKind,
  ShapeKind,
} from "../../types/annotations";
import {
  arrowHeadPath,
  buildSmoothPath,
  clientToUser,
  ellipseAttrs,
  rectAttrs,
  replayTiming,
} from "./annotationGeometry";

interface Props {
  naturalSize: { width: number; height: number };
  tool: AnnTool;
  color: string;
  width: number;
  annotations: Annotation[];
  onCommit: (annotation: Annotation) => void;
  onErase: (id: string) => void;
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
type Live = LiveFree | LiveShape | null;

const FREEHAND_TOOLS: AnnTool[] = ["pen", "highlighter"];
const SHAPE_TOOLS: AnnTool[] = ["line", "arrow", "rect", "ellipse"];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DrawingLayer({
  naturalSize,
  tool,
  color,
  width,
  annotations,
  onCommit,
  onErase,
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
  const editorInputRef = useRef<HTMLInputElement>(null);
  const [replay, setReplay] = useState<ReplayState | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const annotationsRef = useRef<Annotation[]>(annotations);
  annotationsRef.current = annotations;

  const isDrawTool = tool !== "pan";
  const fontSize = Math.max(Math.round(naturalSize.width * 0.032), 12);

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

  // Replay the loaded strokes with a quick staggered draw-in whenever annotations
  // are (re)loaded from storage. The set and per-stroke order are captured up front
  // so strokes the user draws mid-replay aren't swept into the animation.
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

  // Reset transient state when the active tool changes or the layer is disabled.
  useEffect(() => {
    liveRef.current = null;
    erasingRef.current = false;
    if (tool !== "text" && editor) {
      setEditor(null);
      setEditorText("");
      onTextEditingChange?.(false);
    }
  }, [editor, onTextEditingChange, tool]);

  useEffect(() => {
    if (editor) {
      // Focus on the next frame so the input is mounted.
      const id = window.requestAnimationFrame(() => editorInputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [editor]);

  const eraseAt = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const id = target.getAttribute("data-ann-id");
      if (id) onErase(id);
    },
    [onErase],
  );

  const commitEditor = useCallback(() => {
    if (!editor) return;
    const text = editorText.trim();
    if (text) {
      onCommit({
        id: newId(),
        kind: "text",
        color,
        x: editor.x,
        y: editor.y + fontSize, // baseline below the click point
        fontSize,
        text,
      });
    }
    setEditor(null);
    setEditorText("");
    onTextEditingChange?.(false);
  }, [color, editor, editorText, fontSize, onCommit, onTextEditingChange]);

  const cancelEditor = useCallback(() => {
    setEditor(null);
    setEditorText("");
    onTextEditingChange?.(false);
  }, [onTextEditingChange]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!isDrawTool || event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    event.stopPropagation();

    const point = clientToUser(svg, event.clientX, event.clientY);

    if (tool === "text") {
      // Commit any open editor before starting a new one.
      if (editor) commitEditor();
      setEditor({ x: point.x, y: point.y });
      setEditorText("");
      onTextEditingChange?.(true);
      return;
    }

    if (tool === "eraser") {
      erasingRef.current = true;
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
    if (tool === "eraser") {
      // Only erase while the primary button is held. Without pointer capture
      // (needed so event.target is the stroke, not the SVG) a pointerup outside
      // the SVG can leave erasingRef stuck; the buttons check prevents hover-erase.
      if (erasingRef.current && event.buttons === 1) eraseAt(event.target);
      else if (event.buttons === 0) erasingRef.current = false;
      return;
    }
    const live = liveRef.current;
    if (!live || activePointerRef.current !== event.pointerId) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = clientToUser(svg, event.clientX, event.clientY);

    if (live.mode === "free") {
      const last = live.points[live.points.length - 1];
      const minDist = Math.max(naturalSize.width * 0.0015, 1);
      if (Math.hypot(point.x - last.x, point.y - last.y) >= minDist) {
        live.points.push(point);
        scheduleRender();
      }
    } else {
      live.end = point;
      scheduleRender();
    }
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
      if (live.mode === "free" && live.points.length >= 1) {
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
      return <rect key={id} {...common} {...rectAttrs(start, end)} rx={Math.min(strokeWidth, 6)} {...replayProps} />;
    }
    if (kind === "ellipse") {
      return <ellipse key={id} {...common} {...ellipseAttrs(start, end)} {...replayProps} />;
    }
    // line / arrow
    const headSize = Math.max(strokeWidth * 3.5, naturalSize.width * 0.018);
    return (
      <g key={id}>
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...common} {...replayProps} />
        {kind === "arrow" && <path d={arrowHeadPath(start, end, headSize)} {...common} {...replayProps} />}
      </g>
    );
  };

  const renderAnnotation = (ann: Annotation) => {
    switch (ann.kind) {
      case "pen":
      case "highlighter":
        return renderFreehand(ann.id, ann.kind, ann.points, ann.color, ann.width);
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
      default:
        return renderShape(ann.id, ann.kind, ann.start, ann.end, ann.color, ann.width);
    }
  };

  const live = liveRef.current;

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
    >
      {annotations.map(renderAnnotation)}

      {live?.mode === "free" &&
        renderFreehand("__live", live.kind, live.points, color, live.width)}
      {live?.mode === "shape" &&
        renderShape("__live", live.kind, live.start, live.end, color, width)}

      {editor && (
        <foreignObject
          x={editor.x}
          y={editor.y}
          width={Math.max(naturalSize.width - editor.x, naturalSize.width * 0.3)}
          height={fontSize * 1.8}
        >
          <input
            ref={editorInputRef}
            className="drawing-text-input"
            value={editorText}
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
        </foreignObject>
      )}
    </svg>
  );
}
