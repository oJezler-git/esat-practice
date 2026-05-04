import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SelfMarkPanel } from "../../components/question/SelfMarkPanel";
import { NavControls } from "../../components/session/NavControls";
import { SessionHeader } from "../../components/session/SessionHeader";
import { useSettingsStore } from "../../lib/settingsStore";
import { useSessionEngine } from "../../store/sessionSlice";
import {
  formatShortcutKey,
  normalizeShortcutKey,
  type ShortcutAction,
} from "../../types/settings";
import type { SelfMarkResult } from "../../types/schema";

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

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
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
  const showMetadata = !settings.examMode && (isAnswerRevealed || Boolean(currentAttemptResult));
  const confidence = Math.round(currentQuestion.taxonomy.confidence * 100);
  const metadataLine = `${currentQuestion.taxonomy.primary_topic} (${confidence}% confidence)`;
  const sourceLine = `${currentQuestion.source.paper} ${currentQuestion.source.year} · Page ${currentQuestion.source.page}`;
  const hintText = `${shortcutLabels.revealCorrect} = reveal/correct | ${shortcutLabels.incorrect} = wrong | ${shortcutLabels.prev}/${shortcutLabels.next} = navigate | ${shortcutLabels.flag} = flag | ${shortcutLabels.skip} = skip`;

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

      <main className="session-shell flex-1 mx-auto w-full px-4 py-5">
        <div className="session-topline text-sm text-gray-400 mb-4">
          Question {currentIndex + 1} of {totalCount}
          {isFlagged && (
            <span className="ml-2 px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full border border-amber-200">
              Flagged
            </span>
          )}
        </div>

        <div className="session-answer-layout">
          <section className="session-left-panel">
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
              />
            </div>

            {settings.showKeyboardHints && (
              <p className="session-left-hints text-xs text-gray-400 mt-4">{hintText}</p>
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
