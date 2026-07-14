import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AnnTool } from "../../types/annotations";

interface Props {
  tool: AnnTool;
  onToolChange: (tool: AnnTool) => void;
  palette: readonly string[];
  color: string;
  onColorChange: (color: string) => void;
  widthPresets: number[];
  width: number;
  onWidthChange: (width: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => void;
}

type ToolDef = { id: AnnTool; label: string; icon: ReactNode };

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PRIMARY_TOOLS: ToolDef[] = [
  {
    id: "pan",
    label: "Pan & zoom",
    icon: (
      <svg {...iconProps}>
        <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
        <path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    ),
  },
  {
    id: "pen",
    label: "Pen",
    icon: (
      <svg {...iconProps}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    id: "highlighter",
    label: "Highlighter",
    icon: (
      <svg {...iconProps}>
        <path d="M9 11l-4 4v3h3l4-4" />
        <path d="M13 13l6-6a2 2 0 0 0-3-3l-6 6" />
        <path d="M11 9l4 4" />
      </svg>
    ),
  },
  {
    id: "eraser",
    label: "Eraser",
    icon: (
      <svg {...iconProps}>
        <path d="m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.1l9.6-9.6a1.5 1.5 0 0 1 2.1 0l4.6 4.6a1.5 1.5 0 0 1 0 2.1L12 21Z" />
        <path d="M22 21H7" />
        <path d="m5 11 8 8" />
      </svg>
    ),
  },
  {
    id: "text",
    label: "Text",
    icon: (
      <svg {...iconProps}>
        <path d="M5 7V5h14v2M12 5v14M9 19h6" />
      </svg>
    ),
  },
  {
    id: "math",
    label: "Math (LaTeX)",
    icon: (
      <svg {...iconProps}>
        <path d="M3 13h3l2.5 7L13 4h8" />
      </svg>
    ),
  },
];

const SHAPE_TOOLS: ToolDef[] = [
  {
    id: "line",
    label: "Line",
    icon: (
      <svg {...iconProps}>
        <path d="M5 19 19 5" />
      </svg>
    ),
  },
  {
    id: "arrow",
    label: "Arrow",
    icon: (
      <svg {...iconProps}>
        <path d="M5 19 19 5M11 5h8v8" />
      </svg>
    ),
  },
  {
    id: "rect",
    label: "Rectangle",
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="6" width="16" height="12" rx="1.5" />
      </svg>
    ),
  },
  {
    id: "ellipse",
    label: "Ellipse",
    icon: (
      <svg {...iconProps}>
        <ellipse cx="12" cy="12" rx="8" ry="6" />
      </svg>
    ),
  },
];

function ToolButton({
  def,
  active,
  onClick,
}: {
  def: ToolDef;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`annotation-tool-btn ${active ? "annotation-tool-btn-active" : ""}`}
      onClick={onClick}
      title={def.label}
      aria-label={def.label}
      aria-pressed={active}
    >
      {def.icon}
    </button>
  );
}

export function AnnotationToolbar({
  tool,
  onToolChange,
  palette,
  color,
  onColorChange,
  widthPresets,
  width,
  onWidthChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onSave,
}: Props) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleClearClick = () => {
    navigator.vibrate?.(10);
    if (confirmingClear) {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
      setConfirmingClear(false);
      onClear();
      return;
    }
    setConfirmingClear(true);
    confirmTimerRef.current = window.setTimeout(() => {
      setConfirmingClear(false);
      confirmTimerRef.current = null;
    }, 3000);
  };

  return (
    <div className="annotation-toolbar" role="toolbar" aria-label="Drawing tools">
      <div className="annotation-tool-group">
        {PRIMARY_TOOLS.map((def) => (
          <ToolButton
            key={def.id}
            def={def}
            active={tool === def.id}
            onClick={() => onToolChange(def.id)}
          />
        ))}
      </div>

      <div className="annotation-divider" />

      <div className="annotation-tool-group">
        {SHAPE_TOOLS.map((def) => (
          <ToolButton
            key={def.id}
            def={def}
            active={tool === def.id}
            onClick={() => onToolChange(def.id)}
          />
        ))}
      </div>

      <div className="annotation-divider" />

      <div className="annotation-swatches">
        {palette.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`annotation-swatch ${color === swatch ? "annotation-swatch-active" : ""}`}
            style={{ backgroundColor: swatch }}
            onClick={() => onColorChange(swatch)}
            title={`Colour ${swatch}`}
            aria-label={`Colour ${swatch}`}
            aria-pressed={color === swatch}
          />
        ))}
      </div>

      <div className="annotation-divider" />

      <div className="annotation-widths">
        {widthPresets.map((preset, index) => (
          <button
            key={preset}
            type="button"
            className={`annotation-width-btn ${width === preset ? "annotation-width-btn-active" : ""}`}
            onClick={() => onWidthChange(preset)}
            title={["Thin", "Medium", "Thick"][index] ?? "Width"}
            aria-label={`${["Thin", "Medium", "Thick"][index] ?? "Width"} stroke`}
            aria-pressed={width === preset}
          >
            <span
              className="annotation-width-dot"
              style={{ width: 4 + index * 4, height: 4 + index * 4 }}
            />
          </button>
        ))}
      </div>

      <div className="annotation-divider" />

      <div className="annotation-tool-group">
        <button
          type="button"
          className="annotation-tool-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <svg {...iconProps}>
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
          </svg>
        </button>
        <button
          type="button"
          className="annotation-tool-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <svg {...iconProps}>
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9a5 5 0 0 0 0 10h1" />
          </svg>
        </button>
        <button
          type="button"
          className={`annotation-tool-btn annotation-tool-btn-danger ${
            confirmingClear ? "annotation-tool-btn-confirm" : ""
          }`}
          onClick={handleClearClick}
          onBlur={() => {
            if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
            confirmTimerRef.current = null;
            setConfirmingClear(false);
          }}
          title={confirmingClear ? "Click again to clear all" : "Clear all"}
          aria-label={confirmingClear ? "Confirm clear all annotations" : "Clear all annotations"}
        >
          {confirmingClear ? (
            <svg {...iconProps}>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg {...iconProps}>
              <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
            </svg>
          )}
        </button>
      </div>

      <div className="annotation-divider" />

      <div className="annotation-tool-group">
        <button
          type="button"
          className="annotation-tool-btn"
          onClick={onSave}
          title="Save image (with annotations)"
          aria-label="Save image with annotations"
        >
          <svg {...iconProps}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
