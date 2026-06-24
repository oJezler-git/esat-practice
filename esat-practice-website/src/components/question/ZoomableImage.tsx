import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

type ScanTransform = {
  scale: number;
  x: number;
  y: number;
};

type ViewerState = {
  isExpanded: boolean;
  isClosing: boolean;
  scanSourceRect: DOMRect | null;
  scanViewportSize: { width: number; height: number };
  scanNaturalSize: { width: number; height: number };
  isScanDragging: boolean;
  isScanIntroActive: boolean;
  isScanSettling: boolean;
};

type ViewerAction =
  | { type: "open"; sourceRect: DOMRect | null; naturalSize?: { width: number; height: number } }
  | { type: "close_start" }
  | { type: "close_done" }
  | { type: "set_viewport_size"; width: number; height: number }
  | { type: "set_natural_size"; width: number; height: number }
  | { type: "drag_start" }
  | { type: "drag_end" }
  | { type: "intro_done" }
  | { type: "settle_start" }
  | { type: "settle_end" };

function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case "open":
      return {
        ...state,
        isExpanded: true,
        isClosing: false,
        scanSourceRect: action.sourceRect,
        isScanIntroActive: true,
        isScanSettling: false,
        ...(action.naturalSize ? { scanNaturalSize: action.naturalSize } : {}),
      };
    case "close_start":
      return { ...state, isClosing: true };
    case "close_done":
      return {
        ...state,
        isExpanded: false,
        isClosing: false,
        isScanDragging: false,
        isScanIntroActive: false,
        isScanSettling: false,
        scanSourceRect: null,
      };
    case "set_viewport_size":
      return { ...state, scanViewportSize: { width: action.width, height: action.height } };
    case "set_natural_size":
      return { ...state, scanNaturalSize: { width: action.width, height: action.height } };
    case "drag_start":
      return { ...state, isScanDragging: true, isScanSettling: false };
    case "drag_end":
      return { ...state, isScanDragging: false, isScanSettling: true };
    case "intro_done":
      return { ...state, isScanIntroActive: false };
    case "settle_start":
      return { ...state, isScanSettling: true };
    case "settle_end":
      return { ...state, isScanSettling: false };
    default:
      return state;
  }
}

interface Props {
  src: string;
  alt: string;
  previewButtonClassName: string;
  previewImageClassName?: string;
  previewExpandedClassName?: string;
  previewFooter?: ReactNode;
}

export function ZoomableImage({
  src,
  alt,
  previewButtonClassName,
  previewImageClassName,
  previewExpandedClassName = "zoomable-image-preview-expanded",
  previewFooter,
}: Props) {
  const [viewer, dispatchViewer] = useReducer(viewerReducer, {
    isExpanded: false,
    isClosing: false,
    scanSourceRect: null,
    scanViewportSize: { width: 0, height: 0 },
    scanNaturalSize: { width: 0, height: 0 },
    isScanDragging: false,
    isScanIntroActive: false,
    isScanSettling: false,
  });
  const { isExpanded, isClosing, scanSourceRect, scanViewportSize, scanNaturalSize, isScanDragging, isScanIntroActive, isScanSettling } = viewer;
  const [scanTransform, setScanTransform] = useState<ScanTransform>({ scale: 1, x: 0, y: 0 });
  const imageHasDraggedRef = useRef(false);
  const imagePreviewButtonRef = useRef<HTMLButtonElement>(null);
  const scanViewportRef = useRef<HTMLDivElement>(null);
  const scanDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const scanTransformRef = useRef<ScanTransform>(scanTransform);
  const scanWheelTargetRef = useRef<ScanTransform | null>(null);
  const scanWheelFrameRef = useRef<number | null>(null);

  useEffect(() => {
    scanTransformRef.current = scanTransform;
  }, [scanTransform]);

  const scanFitSize = useMemo(() => {
    if (
      scanViewportSize.width === 0 ||
      scanViewportSize.height === 0 ||
      scanNaturalSize.width === 0 ||
      scanNaturalSize.height === 0
    ) {
      return { width: 0, height: 0 };
    }

    const fitScale = Math.min(
      scanViewportSize.width / scanNaturalSize.width,
      scanViewportSize.height / scanNaturalSize.height,
      1,
    );

    return {
      width: scanNaturalSize.width * fitScale,
      height: scanNaturalSize.height * fitScale,
    };
  }, [scanNaturalSize.height, scanNaturalSize.width, scanViewportSize.height, scanViewportSize.width]);

  const clampScanTransform = useCallback(
    (next: ScanTransform) => {
      const scale = Math.min(Math.max(next.scale, 1), 6);
      const scaledWidth = scanFitSize.width * scale;
      const scaledHeight = scanFitSize.height * scale;
      const maxX = Math.max(0, (scaledWidth - scanViewportSize.width) / 2);
      const maxY = Math.max(0, (scaledHeight - scanViewportSize.height) / 2);

      return {
        scale,
        x: Math.min(Math.max(next.x, -maxX), maxX),
        y: Math.min(Math.max(next.y, -maxY), maxY),
      };
    },
    [scanFitSize.height, scanFitSize.width, scanViewportSize.height, scanViewportSize.width],
  );

  const getBoundedScanTransform = useCallback(
    (next: ScanTransform, resistance = 0.24) => {
      const scale = Math.min(Math.max(next.scale, 1), 6);
      const scaledWidth = scanFitSize.width * scale;
      const scaledHeight = scanFitSize.height * scale;
      const maxX = Math.max(0, (scaledWidth - scanViewportSize.width) / 2);
      const maxY = Math.max(0, (scaledHeight - scanViewportSize.height) / 2);

      const resist = (value: number, max: number) => {
        if (value > max) return max + (value - max) * resistance;
        if (value < -max) return -max + (value + max) * resistance;
        return value;
      };

      return {
        scale,
        x: resist(next.x, maxX),
        y: resist(next.y, maxY),
      };
    },
    [scanFitSize.height, scanFitSize.width, scanViewportSize.height, scanViewportSize.width],
  );

  const updateScanTransform = useCallback(
    (updater: (current: ScanTransform) => ScanTransform) => {
      setScanTransform((current) => clampScanTransform(updater(current)));
    },
    [clampScanTransform],
  );

  const getReadableScanScale = useCallback(() => {
    if (scanFitSize.width === 0 || scanFitSize.height === 0 || scanViewportSize.width === 0) {
      return 1;
    }

    const isPortraitPage = scanFitSize.height > scanFitSize.width * 1.15;
    if (!isPortraitPage) {
      return 1;
    }

    return Math.min(Math.max((scanViewportSize.width * 0.62) / scanFitSize.width, 1.35), 2.15);
  }, [scanFitSize.height, scanFitSize.width, scanViewportSize.width]);

  const getDefaultScanTransform = useCallback(() => {
    const scale = getReadableScanScale();
    const scaledHeight = scanFitSize.height * scale;
    const maxY = Math.max(0, (scaledHeight - scanViewportSize.height) / 2);

    return clampScanTransform({ scale, x: 0, y: maxY });
  }, [clampScanTransform, getReadableScanScale, scanFitSize.height, scanViewportSize.height]);

  const handleOpenImage = () => {
    const preview = imagePreviewButtonRef.current;
    const previewImage = preview?.querySelector("img");

    imageHasDraggedRef.current = false;
    setScanTransform({ scale: 1, x: 0, y: 0 });
    dispatchViewer({
      type: "open",
      sourceRect: preview?.getBoundingClientRect() ?? null,
      naturalSize: previewImage?.naturalWidth && previewImage.naturalHeight
        ? { width: previewImage.naturalWidth, height: previewImage.naturalHeight }
        : undefined,
    });
  };

  const handleCloseImage = useCallback(() => {
    if (scanWheelFrameRef.current !== null) {
      window.cancelAnimationFrame(scanWheelFrameRef.current);
      scanWheelFrameRef.current = null;
    }
    scanWheelTargetRef.current = null;
    dispatchViewer({ type: "close_start" });
    window.setTimeout(() => {
      dispatchViewer({ type: "close_done" });
      scanDragRef.current = null;
    }, 200);
  }, []);

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
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
      if (event.key === "Escape") {
        handleCloseImage();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCloseImage, isExpanded]);

  useEffect(() => {
    if (!isExpanded || !scanViewportRef.current) return;

    const viewport = scanViewportRef.current;
    const syncSize = () => {
      dispatchViewer({ type: "set_viewport_size", width: viewport.clientWidth, height: viewport.clientHeight });
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [isExpanded]);

  useEffect(() => {
    setScanTransform((current) => clampScanTransform(current));
  }, [clampScanTransform]);

  useEffect(() => {
    if (
      !isExpanded ||
      !scanSourceRect ||
      scanViewportSize.width === 0 ||
      scanViewportSize.height === 0 ||
      scanFitSize.width === 0 ||
      scanFitSize.height === 0
    ) {
      return;
    }

    const sourceCenterX = scanSourceRect.left + scanSourceRect.width / 2;
    const sourceCenterY = scanSourceRect.top + scanSourceRect.height / 2;
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const sourceScale = Math.max(
      0.08,
      Math.min(scanSourceRect.width / scanFitSize.width, scanSourceRect.height / scanFitSize.height),
    );
    const readableScale = getReadableScanScale();

    setScanTransform({
      scale: sourceScale,
      x: sourceCenterX - viewportCenterX,
      y: sourceCenterY - viewportCenterY,
    });

    const expandFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const scaledHeight = scanFitSize.height * readableScale;
        const topY = Math.max(0, (scaledHeight - scanViewportSize.height) / 2);
        setScanTransform(clampScanTransform({ scale: readableScale, x: 0, y: topY }));
      });
    });
    const doneTimer = window.setTimeout(() => {
      dispatchViewer({ type: "intro_done" });
    }, 260);

    return () => {
      window.cancelAnimationFrame(expandFrame);
      window.clearTimeout(doneTimer);
    };
  }, [
    isExpanded,
    clampScanTransform,
    getReadableScanScale,
    scanFitSize.height,
    scanFitSize.width,
    scanSourceRect,
    scanViewportSize.height,
    scanViewportSize.width,
  ]);

  const handleScanPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    imageHasDraggedRef.current = false;
    if (scanWheelFrameRef.current !== null) {
      window.cancelAnimationFrame(scanWheelFrameRef.current);
      scanWheelFrameRef.current = null;
    }
    scanWheelTargetRef.current = null;
    scanDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: scanTransformRef.current.x,
      originY: scanTransformRef.current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatchViewer({ type: "drag_start" });
  };

  const handleScanPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = scanDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      imageHasDraggedRef.current = true;
    }

    setScanTransform((current) =>
      getBoundedScanTransform({
        scale: current.scale,
        x: drag.originX + dx,
        y: drag.originY + dy,
      }),
    );
  };

  const handleScanPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scanDragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      scanDragRef.current = null;
      dispatchViewer({ type: "drag_end" });
      setScanTransform((current) => clampScanTransform(current));
      window.setTimeout(() => dispatchViewer({ type: "settle_end" }), 260);
    }
  };

  const handleScanWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();

      const viewport = scanViewportRef.current;
      if (!viewport || scanFitSize.width === 0 || scanFitSize.height === 0) return;

      const rect = viewport.getBoundingClientRect();
      const pointerX = event.clientX - rect.left - rect.width / 2;
      const pointerY = event.clientY - rect.top - rect.height / 2;
      const factor = Math.exp(-event.deltaY * 0.00085);

      const current = scanWheelTargetRef.current ?? scanTransformRef.current;
      const nextScale = Math.min(Math.max(current.scale * factor, 1), 6);
      const scaleRatio = nextScale / current.scale;

      scanWheelTargetRef.current = clampScanTransform({
        scale: nextScale,
        x: pointerX - (pointerX - current.x) * scaleRatio,
        y: pointerY - (pointerY - current.y) * scaleRatio,
      });

      if (scanWheelFrameRef.current !== null) return;

      const animate = () => {
        const target = scanWheelTargetRef.current;
        if (!target) {
          scanWheelFrameRef.current = null;
          return;
        }

        const currentTransform = scanTransformRef.current;
        const next = {
          scale: currentTransform.scale + (target.scale - currentTransform.scale) * 0.14,
          x: currentTransform.x + (target.x - currentTransform.x) * 0.14,
          y: currentTransform.y + (target.y - currentTransform.y) * 0.14,
        };
        const settled =
          Math.abs(next.scale - target.scale) < 0.0015 &&
          Math.abs(next.x - target.x) < 0.35 &&
          Math.abs(next.y - target.y) < 0.35;

        if (settled) {
          setScanTransform(target);
          scanTransformRef.current = target;
          scanWheelTargetRef.current = null;
          scanWheelFrameRef.current = null;
          return;
        }

        setScanTransform(next);
        scanTransformRef.current = next;
        scanWheelFrameRef.current = window.requestAnimationFrame(animate);
      };

      scanWheelFrameRef.current = window.requestAnimationFrame(animate);
    },
    [clampScanTransform, scanFitSize.height, scanFitSize.width],
  );

  useEffect(() => {
    const viewport = scanViewportRef.current;
    if (!isExpanded || !viewport) return;

    viewport.addEventListener("wheel", handleScanWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleScanWheel);
  }, [handleScanWheel, isExpanded]);

  useEffect(() => {
    return () => {
      if (scanWheelFrameRef.current !== null) {
        window.cancelAnimationFrame(scanWheelFrameRef.current);
      }
    };
  }, []);

  const zoomSourceScan = (factor: number) => {
    dispatchViewer({ type: "settle_start" });
    updateScanTransform((current) => ({
      scale: current.scale * factor,
      x: current.x,
      y: current.y,
    }));
    window.setTimeout(() => dispatchViewer({ type: "settle_end" }), 260);
  };

  const resetSourceScan = () => {
    dispatchViewer({ type: "settle_start" });
    setScanTransform(getDefaultScanTransform());
    window.setTimeout(() => dispatchViewer({ type: "settle_end" }), 260);
  };

  return (
    <>
      <button
        ref={imagePreviewButtonRef}
        type="button"
        className={`${previewButtonClassName} ${isExpanded ? previewExpandedClassName : ""}`}
        onClick={handleOpenImage}
      >
        <img
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
              onPointerDown={handleScanPointerDown}
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
                  src={src}
                  alt={alt}
                  className="source-scan-image"
                  draggable={false}
                  onLoad={(event) => {
                    dispatchViewer({
                      type: "set_natural_size",
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                />
              </div>
            </div>
            <div className="zoom-button-group source-scan-controls">
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
        </div>,
        document.body
      )}
    </>
  );
}
