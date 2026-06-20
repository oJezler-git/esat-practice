import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SelfMarkPanel } from "../../components/question/SelfMarkPanel";
import { NavControls } from "../../components/session/NavControls";
import { SessionHeader } from "../../components/session/SessionHeader";
import { useQuestionStore } from "../../lib/questionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { useSessionEngine } from "../../store/sessionSlice";
import {
  formatShortcutKey,
  normalizeShortcutKey,
  type ShortcutAction,
} from "../../types/settings";
import type { SelfMarkResult } from "../../types/schema";
import { truncateQuestionText } from "../../lib/textUtils";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    tagName === "BUTTON"
  );
}

type ScanTransform = {
  scale: number;
  x: number;
  y: number;
};

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { allQuestions } = useQuestionStore();
  const settings = useSettingsStore((state) => state.settings);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isClosingImage, setIsClosingImage] = useState(false);
  const [scanTransform, setScanTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [scanViewportSize, setScanViewportSize] = useState({ width: 0, height: 0 });
  const [scanNaturalSize, setScanNaturalSize] = useState({ width: 0, height: 0 });
  const [isScanDragging, setIsScanDragging] = useState(false);
  const [isScanIntroActive, setIsScanIntroActive] = useState(false);
  const [isScanSettling, setIsScanSettling] = useState(false);
  const [scanSourceRect, setScanSourceRect] = useState<DOMRect | null>(null);
  const imageHasDraggedRef = useRef(false);
  const imageModalRef = useRef<HTMLDivElement>(null);
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
    setScanSourceRect(preview?.getBoundingClientRect() ?? null);
    setIsScanIntroActive(true);
    setIsScanSettling(false);

    if (previewImage?.naturalWidth && previewImage.naturalHeight) {
      setScanNaturalSize({
        width: previewImage.naturalWidth,
        height: previewImage.naturalHeight,
      });
    }

    setIsImageExpanded(true);
  };

  const handleCloseImage = useCallback(() => {
    if (scanWheelFrameRef.current !== null) {
      window.cancelAnimationFrame(scanWheelFrameRef.current);
      scanWheelFrameRef.current = null;
    }
    scanWheelTargetRef.current = null;
    setIsClosingImage(true);
    setTimeout(() => {
      setIsImageExpanded(false);
      setIsClosingImage(false);
      setIsScanDragging(false);
      setIsScanIntroActive(false);
      setIsScanSettling(false);
      setScanSourceRect(null);
      scanDragRef.current = null;
    }, 200); // Matches animation duration
  }, []);

  const handleImageBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
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
    if (!isImageExpanded) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseImage();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCloseImage, isImageExpanded]);

  useEffect(() => {
    if (!isImageExpanded || !scanViewportRef.current) return;

    const viewport = scanViewportRef.current;
    const syncSize = () => {
      setScanViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [isImageExpanded]);

  useEffect(() => {
    setScanTransform((current) => clampScanTransform(current));
  }, [clampScanTransform]);

  useEffect(() => {
    if (
      !isImageExpanded ||
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
    const sourceScale = Math.max(0.08, Math.min(scanSourceRect.width / scanFitSize.width, scanSourceRect.height / scanFitSize.height));
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
      setIsScanIntroActive(false);
    }, 260);

    return () => {
      window.cancelAnimationFrame(expandFrame);
      window.clearTimeout(doneTimer);
    };
  }, [
    isImageExpanded,
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
    setIsScanSettling(false);
    scanDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: scanTransformRef.current.x,
      originY: scanTransformRef.current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsScanDragging(true);
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
      setIsScanDragging(false);
      setIsScanSettling(true);
      setScanTransform((current) => clampScanTransform(current));
      window.setTimeout(() => setIsScanSettling(false), 260);
    }
  };

  const handleScanWheel = useCallback((event: WheelEvent) => {
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
  }, [clampScanTransform, scanFitSize.height, scanFitSize.width]);

  useEffect(() => {
    const viewport = scanViewportRef.current;
    if (!isImageExpanded || !viewport) return;

    viewport.addEventListener("wheel", handleScanWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleScanWheel);
  }, [handleScanWheel, isImageExpanded]);

  useEffect(() => {
    return () => {
      if (scanWheelFrameRef.current !== null) {
        window.cancelAnimationFrame(scanWheelFrameRef.current);
      }
    };
  }, []);

  const zoomSourceScan = (factor: number) => {
    setIsScanSettling(true);
    updateScanTransform((current) => ({
      scale: current.scale * factor,
      x: current.x,
      y: current.y,
    }));
    window.setTimeout(() => setIsScanSettling(false), 260);
  };

  const resetSourceScan = () => {
    setIsScanSettling(true);
    setScanTransform(getDefaultScanTransform());
    window.setTimeout(() => setIsScanSettling(false), 260);
  };

  const {
    status,
    currentQuestion,
    currentIndex,
    totalCount,
    timeRemaining,
    currentAttemptResult,
    isFlagged,
    mark,
    flag,
    skip,
    excludeCurrentQuestion,
    nav,
    jumpTo,
    submit,
    responses,
    questions,
  } = useSessionEngine(id ?? "");

  const autoAdvanceQuestionRef = useRef<string | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const fontClass = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  }[settings.fontSize];
  const shortcutLabels = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(settings.shortcuts).map(([action, key]) => [
          action,
          formatShortcutKey(key),
        ]),
      ) as Record<ShortcutAction, string>,
    [settings.shortcuts],
  );

  const handleMark = useCallback(
    (result: SelfMarkResult) => {
      if (currentQuestion) {
        autoAdvanceQuestionRef.current = currentQuestion.id;
      }
      void mark(result);
    },
    [currentQuestion, mark],
  );

  const revealAnswer = useCallback(() => {
    setIsAnswerRevealed(true);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isInteractiveTarget(event.target)
      ) {
        return;
      }

      const key = normalizeShortcutKey(event.key);
      if (!key) {
        return;
      }

      const action = (
        Object.entries(settings.shortcuts).find(([, shortcut]) => shortcut === key)?.[0] ??
        null
      ) as ShortcutAction | null;

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "revealCorrect") {
        if (currentAttemptResult) {
          return;
        }

        if (!isAnswerRevealed) {
          revealAnswer();
          return;
        }

        handleMark("correct");
      } else if (action === "incorrect") {
        handleMark("incorrect");
      } else if (action === "next") {
        void nav("next");
      } else if (action === "prev") {
        void nav("prev");
      } else if (action === "flag") {
        void flag();
      } else if (action === "skip") {
        void skip();
      }
    },
    [
      currentAttemptResult,
      flag,
      handleMark,
      isAnswerRevealed,
      nav,
      revealAnswer,
      settings.shortcuts,
      skip,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setIsAnswerRevealed(Boolean(currentAttemptResult));
  }, [currentAttemptResult, currentQuestion?.id]);

  useEffect(() => {
    if (status === "completed" && id) {
      navigate(`/results/${id}`);
    }
  }, [id, navigate, status]);

  useEffect(() => {
    if (!settings.autoAdvance || !currentQuestion || !currentAttemptResult) {
      return;
    }

    if (autoAdvanceQuestionRef.current !== currentQuestion.id) {
      return;
    }

    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }

    const delay = settings.autoAdvanceDelayMs ?? 600;

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceQuestionRef.current = null;
      autoAdvanceTimerRef.current = null;
      void nav("next");
    }, delay);

    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [currentAttemptResult, currentQuestion, nav, settings.autoAdvance, settings.autoAdvanceDelayMs]);

  if (status === "idle" || status === "configured") {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Loading session...
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        No questions found.
      </div>
    );
  }

  const imageSrc =
    currentQuestion.content.image_url ??
    (currentQuestion.content.image_b64
      ? currentQuestion.content.image_b64.startsWith("data:")
        ? currentQuestion.content.image_b64
        : `data:image/png;base64,${currentQuestion.content.image_b64}`
      : undefined);
  const questionPreview = truncateQuestionText(currentQuestion.content.text.replace(/\s+/g, " "), 130);
  const showMetadata = !settings.examMode && (isAnswerRevealed || Boolean(currentAttemptResult));
  const confidence = Math.round(currentQuestion.taxonomy.confidence * 100);
  const metadataLine = `${currentQuestion.taxonomy.primary_topic} (${confidence}% confidence)`;
  const sourceLine = `${currentQuestion.source.paper} ${currentQuestion.source.year} · Page ${currentQuestion.source.page}`;
  const hintText = `${shortcutLabels.revealCorrect} = reveal/correct | ${shortcutLabels.incorrect} = wrong | ${shortcutLabels.prev}/${shortcutLabels.next} = navigate | ${shortcutLabels.flag} = flag | ${shortcutLabels.skip} = skip`;

  return (
    <div className="h-screen flex flex-col bg-[#101412] overflow-hidden">
      <SessionHeader
        currentIndex={currentIndex}
        timeRemaining={timeRemaining}
        isFlagged={isFlagged}
        onFlag={() => {
          void flag();
        }}
        onNavigate={(index) => {
          void jumpTo(index);
        }}
        responses={responses}
        questionIds={questions.map((q) => q.id)}
      />

      <main className="session-shell flex-1 mx-auto w-full px-4 pt-3 pb-3 flex flex-col min-h-0">
        <div className="session-answer-layout flex-1 min-h-0">
          <section className="session-left-panel overflow-y-auto">
            <div className="session-topline text-sm text-gray-400 mb-3">
              Question {currentIndex + 1} of {totalCount}
              {isFlagged && (
                <span className="ml-2 px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full border border-amber-200">
                  Flagged
                </span>
              )}
            </div>
            <p className={`session-question-preview ${fontClass}`}>{questionPreview}</p>
            <p className="text-xs text-gray-500 mt-2">
              OCR is inaccurate. Use the source image on the right for the question.
            </p>
            {showMetadata && (
              <div className="session-question-meta">
                <p className="session-question-topic">{metadataLine}</p>
                <p className="session-question-source">{sourceLine}</p>
              </div>
            )}

            <div className="mt-4">
              <SelfMarkPanel
                correctAnswer={currentQuestion.answer.correct}
                onMark={handleMark}
                onReveal={revealAnswer}
                revealed={isAnswerRevealed}
                result={currentAttemptResult}
                revealShortcutLabel={shortcutLabels.revealCorrect}
                incorrectShortcutLabel={shortcutLabels.incorrect}
                hideRevealOnMobile={true}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 hide-on-mobile">
              <div>
                <p className="text-xs text-rose-700">
                  Press this if a question number is marked with an ✖, this means it's not on the specification.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void excludeCurrentQuestion(allQuestions);
                }}
                className="shrink-0 rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
              >
                Exclude
              </button>
            </div>

            {settings.showKeyboardHints && (
              <p className="session-left-hints text-xs text-gray-400 mt-4 hide-on-mobile">{hintText}</p>
            )}
          </section>

          <section className="session-right-panel">
            {imageSrc ? (
              <>
                <div className="session-image-label">Source scan</div>
                <div className={`session-image-scroll ${isImageExpanded ? "session-image-scroll-expanded" : ""}`}>
                  <button
                    ref={imagePreviewButtonRef}
                    type="button"
                    className="w-full h-full cursor-zoom-in"
                    onClick={handleOpenImage}
                  >
                    <img src={imageSrc} alt="Question source scan" />
                  </button>
                </div>
              </>
            ) : (
              <div className="session-image-empty">
                No scanned image is available for this question.
              </div>
            )}
          </section>
        </div>
      </main>

      <NavControls
        currentIndex={currentIndex}
        totalCount={totalCount}
        onPrev={() => {
          void nav("prev");
        }}
        onNext={() => {
          void nav("next");
        }}
        onExclude={() => {
          void excludeCurrentQuestion(allQuestions);
        }}
        onSubmit={() => {
          void submit();
        }}
        onReveal={revealAnswer}
        revealed={isAnswerRevealed}
      />

      {isImageExpanded && imageSrc && (
        <div
          ref={imageModalRef}
          className={`source-scan-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 ${
            isClosingImage ? "modal-backdrop-exit" : "modal-backdrop-enter"
          }`}
          onClick={handleImageBackdropClick}
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
                  src={imageSrc}
                  alt="Question source scan"
                  className="source-scan-image"
                  draggable={false}
                  onLoad={(event) => {
                    setScanNaturalSize({
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
        </div>
      )}

      {isAnswerRevealed && (
        <div className="show-on-mobile selfmark-mobile-popup-overlay">
          <div className="selfmark-mobile-popup-content">
            <button
              type="button"
              onClick={() => setIsAnswerRevealed(false)}
              className="selfmark-mobile-close-button"
            >
              ✕
            </button>
            <div className="selfmark-answer-hero">
              <span className="selfmark-answer-kicker">Correct answer</span>
              <strong className="selfmark-answer-value">
                {currentQuestion.answer.correct}
              </strong>
            </div>
            <p className="selfmark-prompt">Did you get it right?</p>
            <div className="selfmark-actions">
              <button
                type="button"
                onClick={() => handleMark("correct")}
                className="selfmark-action-button selfmark-action-button-correct"
              >
                <span>Correct</span>
              </button>
              <button
                type="button"
                onClick={() => handleMark("incorrect")}
                className="selfmark-action-button selfmark-action-button-incorrect"
              >
                <span>Incorrect</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
