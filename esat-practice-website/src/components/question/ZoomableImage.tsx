import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { AnnTool } from "../../types/annotations";
import { DrawingLayer } from "./DrawingLayer";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { TOOL_HINTS, useAnnotationSession } from "./zoomImage/useAnnotationSession";
import { useScanViewport } from "./zoomImage/useScanViewport";

interface Props {
  src: string;
  alt: string;
  previewButtonClassName: string;
  previewImageClassName?: string;
  previewExpandedClassName?: string;
  previewFooter?: ReactNode;
  /** Enable the annotation/drawing toolbar (used for the session source scan). */
  enableDrawing?: boolean;
  /** Stable key (e.g. question id) used to persist annotations per question. */
  persistKey?: string;
}

export function ZoomableImage({
  src,
  alt,
  previewButtonClassName,
  previewImageClassName,
  previewExpandedClassName = "zoomable-image-preview-expanded",
  previewFooter,
  enableDrawing = false,
  persistKey,
}: Props) {
  const viewport = useScanViewport();
  const {
    isExpanded, isClosing, scanNaturalSize,
    isScanDragging, isScanIntroActive, isScanSettling,
    scanTransform, scanFitSize,
    imagePreviewButtonRef, scanViewportRef, imageHasDraggedRef,
    handleOpenImage, handleCloseImage,
    handleScanPointerDown, handleScanPointerMove, handleScanPointerUp,
    zoomSourceScan, resetSourceScan, setNaturalSize,
  } = viewport;

  const session = useAnnotationSession(enableDrawing, isExpanded, persistKey, scanNaturalSize.width);
  const {
    tool, isTextEditing, setIsTextEditing,
    annotations, canUndo, canRedo,
    widthPresets, strokeWidth, activeColor, activePalette,
    replayNonce,
    showHint, hintAnchorY, dismissHint,
    toolHint, toolHintY, savedPulse,
    handleToolChange, handleColorChange, handleWidthChange,
    handleCommitAnnotation, handleEraseAnnotation, handleUpdateAnnotation,
    setTool, setWidthIndex, undo, redo, clear,
  } = session;

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (isTextEditing) {
      return;
    }

    if (imageHasDraggedRef.current) {
      imageHasDraggedRef.current = false;
      return;
    }

    handleCloseImage();
  };

  useEffect(() => {
    if (!isExpanded) return;

    const onKey = (event: KeyboardEvent) => {
      // Let the in-place text editor handle its own keys.
      if (isTextEditing) return;

      if (enableDrawing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }

      // Tool keyboard shortcuts (desktop): P pen, H highlighter, E eraser,
      // T text, V/Esc pan, [ / ] cycle stroke width.
      if (enableDrawing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const toolKeys: Partial<Record<string, AnnTool>> = {
          p: "pen", h: "highlighter", e: "eraser", t: "text", m: "math", v: "pan",
        };
        const mapped = toolKeys[event.key.toLowerCase()];
        if (mapped) {
          event.preventDefault();
          handleToolChange(mapped);
          return;
        }
        if (event.key === "[") {
          event.preventDefault();
          setWidthIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (event.key === "]") {
          event.preventDefault();
          setWidthIndex((i) => Math.min(widthPresets.length - 1, i + 1));
          return;
        }
      }

      if (event.key === "Escape") {
        if (enableDrawing && tool !== "pan") {
          setTool("pan");
          return;
        }
        handleCloseImage();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enableDrawing, handleCloseImage, handleToolChange, isExpanded, isTextEditing, redo, setTool, setWidthIndex, tool, undo, widthPresets.length]);

  useEffect(() => {
    if (!isExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded]);

  return (
    <>
      <button
        ref={imagePreviewButtonRef}
        type="button"
        className={`${previewButtonClassName} ${isExpanded ? previewExpandedClassName : ""}`}
        onClick={handleOpenImage}
      >
        <img
          key={persistKey ?? src}
          src={src}
          alt={alt}
          className={previewImageClassName}
        />
        {previewFooter}
      </button>

      {isExpanded && createPortal(
        <div
          className={`source-scan-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 ${
            isClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
          }`}
          onClick={handleBackdropClick}
        >
          <div
            className="source-scan-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              ref={scanViewportRef}
              className={`source-scan-viewport ${isScanDragging ? "source-scan-viewport-dragging" : ""}`}
              onPointerDown={(event) => {
                // While a drawing tool is active, the SVG layer handles input — never pan.
                if (enableDrawing && tool !== "pan") return;
                handleScanPointerDown(event);
              }}
              onPointerMove={handleScanPointerMove}
              onPointerUp={handleScanPointerUp}
              onPointerCancel={handleScanPointerUp}
            >
              <div
                className={`source-scan-paper ${isScanIntroActive || isScanSettling ? "source-scan-paper-animated" : ""}`}
                style={{
                  width: `${scanFitSize.width}px`,
                  height: `${scanFitSize.height}px`,
                  transform: `translate3d(${scanTransform.x}px, ${scanTransform.y}px, 0) scale(${scanTransform.scale})`,
                }}
              >
                <img
                  key={persistKey ?? src}
                  src={src}
                  alt={alt}
                  className="source-scan-image"
                  draggable={false}
                  onLoad={(event) => {
                    setNaturalSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
                  }}
                />
                {enableDrawing && scanNaturalSize.width > 0 && (
                  <DrawingLayer
                    naturalSize={scanNaturalSize}
                    tool={tool}
                    color={activeColor}
                    width={strokeWidth}
                    annotations={annotations}
                    onCommit={handleCommitAnnotation}
                    onErase={handleEraseAnnotation}
                    onUpdate={handleUpdateAnnotation}
                    onTextEditingChange={setIsTextEditing}
                    replayNonce={replayNonce}
                  />
                )}
              </div>
            </div>
            {enableDrawing && (
              <AnnotationToolbar
                tool={tool}
                onToolChange={handleToolChange}
                palette={activePalette}
                color={activeColor}
                onColorChange={handleColorChange}
                widthPresets={widthPresets}
                width={strokeWidth}
                onWidthChange={handleWidthChange}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                onClear={clear}
              />
            )}
            <div className="zoom-button-group source-scan-controls">
              {enableDrawing && (
                <button
                  type="button"
                  onClick={() => handleToolChange(tool === "pen" ? "pan" : "pen")}
                  className={`zoom-button show-inline-on-mobile ${
                    tool === "pen" ? "zoom-button-active" : ""
                  }`}
                  title={tool === "pen" ? "Stop drawing" : "Draw"}
                  aria-label={tool === "pen" ? "Stop drawing" : "Draw"}
                  aria-pressed={tool === "pen"}
                >
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => zoomSourceScan(1.25)}
                className="zoom-button"
                title="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => zoomSourceScan(0.8)}
                className="zoom-button"
                title="Zoom out"
              >
                -
              </button>
              <button
                type="button"
                onClick={resetSourceScan}
                className="zoom-button zoom-button-reset"
                title="Reset zoom"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleCloseImage}
                className="zoom-button"
                title="Close"
              >
                X
              </button>
            </div>
          </div>
          {showHint && (
            <button
              type="button"
              className="annotation-hint"
              style={hintAnchorY !== null ? { top: `${hintAnchorY}px` } : undefined}
              onClick={dismissHint}
              aria-label="Dismiss tip"
            >
              Tap the <strong>pen</strong> to annotate
            </button>
          )}
          {toolHint && (
            <div
              className="annotation-tool-hint"
              style={toolHintY !== null ? { top: `${toolHintY}px` } : undefined}
            >
              Hint: {toolHint}
            </div>
          )}
          {savedPulse && (
            <div className="annotation-saved-pulse" aria-live="polite">
              Saved ✓
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// Re-export for backward compatibility with any direct imports.
export { TOOL_HINTS };
