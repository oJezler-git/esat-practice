import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SelfMarkPanel } from "../../components/question/SelfMarkPanel";
import { NavControls } from "../../components/session/NavControls";
import { SessionHeader } from "../../components/session/SessionHeader";
import { useSettingsStore } from "../../lib/settingsStore";
import { useSessionEngine } from "../../store/sessionSlice";
import type { SelfMarkResult } from "../../types/schema";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);
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
    nav,
    submit,
  } = useSessionEngine(id ?? "");

  const autoAdvanceQuestionRef = useRef<string | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const fontClass = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  }[settings.fontSize];

  const handleMark = useCallback(
    (result: SelfMarkResult) => {
      if (currentQuestion) {
        autoAdvanceQuestionRef.current = currentQuestion.id;
      }
      void mark(result);
    },
    [currentQuestion, mark],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "y") {
        handleMark("correct");
      } else if (key === "n") {
        handleMark("incorrect");
      } else if (event.key === "ArrowRight") {
        void nav("next");
      } else if (event.key === "ArrowLeft") {
        void nav("prev");
      } else if (key === "f") {
        void flag();
      } else if (key === "s") {
        void skip();
      }
    },
    [flag, handleMark, nav, skip],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceQuestionRef.current = null;
      autoAdvanceTimerRef.current = null;
      void nav("next");
    }, 600);

    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [currentAttemptResult, currentQuestion, nav, settings.autoAdvance]);

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

  const imageSrc = currentQuestion.content.image_b64
    ? currentQuestion.content.image_b64.startsWith("data:")
      ? currentQuestion.content.image_b64
      : `data:image/png;base64,${currentQuestion.content.image_b64}`
    : undefined;
  const questionPreview = currentQuestion.content.text.replace(/\s+/g, " ").trim();

  return (
    <div className="min-h-screen flex flex-col">
      <SessionHeader
        currentIndex={currentIndex}
        totalCount={totalCount}
        timeRemaining={timeRemaining}
        isFlagged={isFlagged}
        calculatorAllowed={settings.calculatorAllowed}
        onFlag={() => {
          void flag();
        }}
      />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <div className="text-sm text-gray-400 mb-4">
          Question {currentIndex + 1} of {totalCount}
          {isFlagged && (
            <span className="ml-2 px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full border border-amber-200">
              Flagged
            </span>
          )}
        </div>

        <div className="session-answer-layout">
          <section className="session-left-panel">
            {!settings.examMode && (
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">
                  {currentQuestion.taxonomy.primary_topic}
                </span>
                <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">
                  {currentQuestion.source.paper} {currentQuestion.source.year}
                </span>
                <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">
                  Confidence {Math.round(currentQuestion.taxonomy.confidence * 100)}%
                </span>
              </div>
            )}

            <p className={`session-question-preview ${fontClass}`}>{questionPreview}</p>
            <p className="text-xs text-gray-500 mt-2">
              OCR preview only. Use the source image on the right for the full question.
            </p>

            <div className="mt-4">
              <SelfMarkPanel
                correctAnswer={currentQuestion.answer.correct}
                onMark={handleMark}
                result={currentAttemptResult}
              />
            </div>

            {settings.showKeyboardHints && (
              <p className="session-left-hints text-xs text-gray-400 mt-4">
                Y = correct | N = wrong | Left/Right = navigate | F = flag | S = skip
              </p>
            )}
          </section>

          <section className="session-right-panel">
            {imageSrc ? (
              <>
                <div className="session-image-label">Source scan</div>
                <div className="session-image-scroll">
                  <img src={imageSrc} alt="Question source scan" />
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
        onSkip={() => {
          void skip();
        }}
        onSubmit={() => {
          void submit();
        }}
      />
    </div>
  );
}
