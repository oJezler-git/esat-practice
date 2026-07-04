import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Annotation, AnnTool } from "../../../types/annotations";
import { ANNOTATION_COLORS, HIGHLIGHTER_COLORS } from "../../../types/annotations";
import { loadAnnotations, saveAnnotations } from "../../../lib/annotationStore";
import { defaultStrokeWidth } from "../annotationGeometry";

const ANN_PREF_KEY = "esat-ann-prefs";
const ANN_HINT_KEY = "esat-ann-hint-seen";

export const TOOL_HINTS: Partial<Record<AnnTool, string>> = {
  line:    "Hold Shift to snap to 10° increments",
  arrow:   "Hold Shift to snap to 10° increments",
  rect:    "Hold Shift for a perfect square",
  ellipse: "Hold Shift for a perfect circle",
  text:    "Enter to confirm · Esc to cancel",
  math:    "Type LaTeX, e.g. \\frac{1}{2} · Enter to confirm · Esc to cancel",
};

interface AnnPrefs { penColor: string; highlighterColor: string; widthIndex: number }
function loadAnnPrefs(): Partial<AnnPrefs> {
  try { return JSON.parse(localStorage.getItem(ANN_PREF_KEY) ?? "{}"); }
  catch { return {}; }
}
function saveAnnPrefs(prefs: AnnPrefs) {
  try { localStorage.setItem(ANN_PREF_KEY, JSON.stringify(prefs)); } catch {}
}

type AnnHistory = {
  past: Annotation[][];
  present: Annotation[];
  future: Annotation[][];
};

type AnnHistoryAction =
  | { type: "load"; items: Annotation[] }
  | { type: "commit"; annotation: Annotation }
  | { type: "erase"; id: string }
  | { type: "update"; annotation: Annotation }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

const EMPTY_HISTORY: AnnHistory = { past: [], present: [], future: [] };

function annHistoryReducer(state: AnnHistory, action: AnnHistoryAction): AnnHistory {
  switch (action.type) {
    case "load":
      return { past: [], present: action.items, future: [] };
    case "commit":
      return {
        past: [...state.past, state.present],
        present: [...state.present, action.annotation],
        future: [],
      };
    case "erase": {
      if (!state.present.some((ann) => ann.id === action.id)) return state;
      return {
        past: [...state.past, state.present],
        present: state.present.filter((ann) => ann.id !== action.id),
        future: [],
      };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    case "update": {
      if (!state.present.some((ann) => ann.id === action.annotation.id)) return state;
      return {
        past: [...state.past, state.present],
        present: state.present.map((ann) =>
          ann.id === action.annotation.id ? action.annotation : ann,
        ),
        future: [],
      };
    }
    case "clear":
      if (state.present.length === 0) return state;
      return { past: [...state.past, state.present], present: [], future: [] };
    default:
      return state;
  }
}

/**
 * Owns annotation tool/color/width preferences, undo/redo history, per-question
 * persistence, and the contextual hint bubbles. Independent of the pan/zoom
 * viewer transform.
 */
export function useAnnotationSession(enableDrawing: boolean, isExpanded: boolean, persistKey: string | undefined, naturalWidth: number) {
  const [tool, setTool] = useState<AnnTool>("pan");
  const [penColor, setPenColor] = useState<string>(() => loadAnnPrefs().penColor ?? ANNOTATION_COLORS[0]);
  const [highlighterColor, setHighlighterColor] = useState<string>(() => loadAnnPrefs().highlighterColor ?? HIGHLIGHTER_COLORS[0]);
  const [widthIndex, setWidthIndex] = useState<number>(() => {
    const saved = loadAnnPrefs().widthIndex;
    return saved !== undefined ? saved : 1;
  });
  const [isTextEditing, setIsTextEditing] = useState(false);
  const [annHistory, dispatchAnn] = useReducer(annHistoryReducer, EMPTY_HISTORY);
  const [replayNonce, setReplayNonce] = useState(0);
  const annotations = annHistory.present;
  const saveTimerRef = useRef<number | null>(null);
  const annotationsRef = useRef<Annotation[]>(annotations);
  const skipSaveRef = useRef(false);
  annotationsRef.current = annotations;
  const [showHint, setShowHint] = useState(false);
  const [hintAnchorY, setHintAnchorY] = useState<number | null>(null);
  const [toolHint, setToolHint] = useState<string | null>(null);
  const [toolHintY, setToolHintY] = useState<number | null>(null);
  const toolHintTimerRef = useRef<number | null>(null);
  const [savedPulse, setSavedPulse] = useState(false);
  const savedPulseTimerRef = useRef<number | null>(null);
  const lastPulseTimeRef = useRef(0);

  const widthPresets = useMemo(() => {
    const base = defaultStrokeWidth(naturalWidth || 1000);
    return [
      Math.max(1, Math.round(base * 0.6)),
      base,
      Math.round(base * 1.9),
    ];
  }, [naturalWidth]);
  const strokeWidth = widthPresets[widthIndex] ?? widthPresets[1];
  const isHighlighter = tool === "highlighter";
  const activeColor = isHighlighter ? highlighterColor : penColor;
  const activePalette = isHighlighter ? HIGHLIGHTER_COLORS : ANNOTATION_COLORS;

  // Persist annotation colour/width preferences so they survive reloads.
  useEffect(() => {
    if (!enableDrawing) return;
    saveAnnPrefs({ penColor, highlighterColor, widthIndex });
  }, [enableDrawing, penColor, highlighterColor, widthIndex]);

  // Load persisted annotations when the viewer opens for a given question, and
  // flush this question's latest annotations on cleanup (close, unmount, or
  // navigating to another question while open) so nothing is lost.
  useEffect(() => {
    if (!enableDrawing || !isExpanded) return;
    setTool("pan");
    setIsTextEditing(false);
    // The follow-up `load` re-render must not trigger a destructive empty save.
    skipSaveRef.current = true;
    dispatchAnn({ type: "load", items: persistKey ? loadAnnotations(persistKey) : [] });
    // Trigger the staggered draw-in replay of the just-loaded strokes.
    setReplayNonce((n) => n + 1);

    // First-open hint: show once, dismiss automatically after 4 s.
    if (!localStorage.getItem(ANN_HINT_KEY)) {
      setShowHint(true);
      const hintTimer = window.setTimeout(() => {
        setShowHint(false);
        localStorage.setItem(ANN_HINT_KEY, "true");
      }, 4000);
      return () => {
        window.clearTimeout(hintTimer);
      };
    }

    const keyAtLoad = persistKey;
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (savedPulseTimerRef.current !== null) {
        window.clearTimeout(savedPulseTimerRef.current);
        savedPulseTimerRef.current = null;
      }
      if (keyAtLoad) saveAnnotations(keyAtLoad, annotationsRef.current);
    };
  }, [enableDrawing, isExpanded, persistKey]);

  // Debounced persistence of annotations while the viewer is open. Skips the
  // render in which `load` is applied so loading never overwrites stored data.
  useEffect(() => {
    if (!enableDrawing || !isExpanded || !persistKey) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveAnnotations(persistKey, annotationsRef.current);
      saveTimerRef.current = null;
      // Throttled "✓ saved" whisper: at most once every 3 s so it doesn't
      // appear on every individual stroke.
      const now = Date.now();
      if (now - lastPulseTimeRef.current > 3000) {
        lastPulseTimeRef.current = now;
        setSavedPulse(false);   // force remount so the animation restarts
        window.requestAnimationFrame(() => setSavedPulse(true));
        if (savedPulseTimerRef.current !== null) window.clearTimeout(savedPulseTimerRef.current);
        savedPulseTimerRef.current = window.setTimeout(() => {
          setSavedPulse(false);
          savedPulseTimerRef.current = null;
        }, 1800);
      }
    }, 400);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [annotations, enableDrawing, isExpanded, persistKey]);

  const handleToolChange = useCallback((next: AnnTool) => {
    setTool(next);
    setIsTextEditing(false);
    navigator.vibrate?.(10);
    if (toolHintTimerRef.current !== null) window.clearTimeout(toolHintTimerRef.current);
    const hint = TOOL_HINTS[next] ?? null;
    setToolHint(hint);
    if (hint) {
      toolHintTimerRef.current = window.setTimeout(() => {
        setToolHint(null);
        toolHintTimerRef.current = null;
      }, 3500);
    }
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    localStorage.setItem(ANN_HINT_KEY, "true");
  }, []);

  // After the toolbar paints, query the Pen button's vertical centre so the
  // hint arrow points at it precisely regardless of screen size.
  useEffect(() => {
    if (!showHint) { setHintAnchorY(null); return; }
    const id = window.requestAnimationFrame(() => {
      const penBtn = document.querySelector<HTMLElement>('.annotation-toolbar [aria-label="Pen"]');
      if (penBtn) {
        const rect = penBtn.getBoundingClientRect();
        setHintAnchorY(rect.top + rect.height / 2);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [showHint]);

  // Position the contextual tool hint next to the active tool button.
  useEffect(() => {
    if (!toolHint) { setToolHintY(null); return; }
    const labelMap: Partial<Record<AnnTool, string>> = {
      line: "Line", arrow: "Arrow", rect: "Rectangle", ellipse: "Ellipse", text: "Text",
      math: "Math (LaTeX)",
    };
    const label = labelMap[tool];
    if (!label) { setToolHintY(null); return; }
    const id = window.requestAnimationFrame(() => {
      const btn = document.querySelector<HTMLElement>(`.annotation-toolbar [aria-label="${label}"]`);
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setToolHintY(rect.top + rect.height / 2);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [toolHint, tool]);

  const handleColorChange = useCallback(
    (color: string) => {
      if (isHighlighter) setHighlighterColor(color);
      else setPenColor(color);
    },
    [isHighlighter],
  );

  const handleWidthChange = useCallback(
    (value: number) => {
      const index = widthPresets.indexOf(value);
      if (index !== -1) setWidthIndex(index);
    },
    [widthPresets],
  );

  const handleCommitAnnotation = useCallback((annotation: Annotation) => {
    dispatchAnn({ type: "commit", annotation });
  }, []);

  const handleEraseAnnotation = useCallback((id: string) => {
    dispatchAnn({ type: "erase", id });
  }, []);

  const handleUpdateAnnotation = useCallback((annotation: Annotation) => {
    dispatchAnn({ type: "update", annotation });
  }, []);

  const undo = useCallback(() => dispatchAnn({ type: "undo" }), []);
  const redo = useCallback(() => dispatchAnn({ type: "redo" }), []);
  const clear = useCallback(() => dispatchAnn({ type: "clear" }), []);

  return {
    tool,
    setTool,
    isTextEditing,
    setIsTextEditing,
    annotations,
    canUndo: annHistory.past.length > 0,
    canRedo: annHistory.future.length > 0,
    widthPresets,
    strokeWidth,
    activeColor,
    activePalette,
    isHighlighter,
    replayNonce,
    showHint,
    hintAnchorY,
    dismissHint,
    toolHint,
    toolHintY,
    savedPulse,
    handleToolChange,
    handleColorChange,
    handleWidthChange,
    handleCommitAnnotation,
    handleEraseAnnotation,
    handleUpdateAnnotation,
    setWidthIndex,
    undo,
    redo,
    clear,
  };
}
