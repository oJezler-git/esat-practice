import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ZoomableImage } from "../../components/question/ZoomableImage";
import { SelfMarkPanel } from "../../components/question/SelfMarkPanel";
import { NavControls } from "../../components/session/NavControls";
import { SessionHeader } from "../../components/session/SessionHeader";
import { useQuestionStore } from "../../lib/questionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { useSessionEngine } from "../../store/sessionSlice";
import { formatShortcutKey, type ShortcutAction } from "../../types/settings";
import type { SelfMarkResult } from "../../types/schema";
import { truncateQuestionText } from "../../lib/textUtils";
import { AskClaudeButton } from "../../components/AskClaudeButton";
import { MobileRevealPopup } from "./MobileRevealPopup";
import { useAutoAdvance } from "./useAutoAdvance";
import { useSessionKeyboardShortcuts } from "./useSessionKeyboardShortcuts";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { allQuestions } = useQuestionStore();
  const settings = useSettingsStore((state) => state.settings);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);

  const {
    notFound,
    status,
    session,
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

  const { armForCurrentQuestion } = useAutoAdvance({
    enabled: settings.autoAdvance,
    delayMs: settings.autoAdvanceDelayMs,
    currentQuestionId: currentQuestion?.id,
    currentAttemptResult,
    nav,
  });

  const handleMark = useCallback(
    (result: SelfMarkResult) => {
      if (currentQuestion) {
        armForCurrentQuestion(currentQuestion.id);
      }
      void mark(result);
    },
    [armForCurrentQuestion, currentQuestion, mark],
  );

  const revealAnswer = useCallback(() => {
    setIsAnswerRevealed(true);
  }, []);

  useSessionKeyboardShortcuts({
    shortcuts: settings.shortcuts,
    currentAttemptResult,
    isAnswerRevealed,
    revealAnswer,
    handleMark,
    nav,
    flag,
    skip,
  });

  useEffect(() => {
    setIsAnswerRevealed(Boolean(currentAttemptResult));
  }, [currentAttemptResult, currentQuestion?.id]);

  useEffect(() => {
    if (status === "completed" && id && session?.id === id) {
      navigate(`/results/${id}`);
    }
  }, [id, navigate, session?.id, status]);

  useEffect(() => {
    if (notFound) {
      navigate("/", { replace: true });
    }
  }, [notFound, navigate]);

  if (notFound) {
    return null;
  }

  if (status === "idle" || status === "configured") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "var(--text-muted)" }}>
        Loading session...
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "var(--text-muted)" }}>
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
    <div className="sk-session">
      <div className="sk-session-frame">
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

      <main className="sk-session-body">
        <div className="session-answer-layout">
          <section className="session-left-panel">
            <div className="session-topline">
              Question {currentIndex + 1} of {totalCount}
              {isFlagged && <span className="sk-flag-badge">Flagged</span>}
            </div>
            <p className={`session-question-preview ${fontClass}`}>{questionPreview}</p>
            <p className="session-ocr-note">
              OCR is inaccurate. Use the image for the question.
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

            <div style={{ marginTop: "0.75rem" }}>
              <AskClaudeButton question={currentQuestion} />
            </div>

            <div className="session-exclude-notice hide-on-mobile">
              <p>
                Press this if a question number has a ✖ over it, this means it's not on the specification.
              </p>
              <button
                type="button"
                onClick={() => {
                  void excludeCurrentQuestion(allQuestions);
                }}
                className="session-exclude-btn"
              >
                Exclude
              </button>
            </div>

            {settings.showKeyboardHints && (
              <p className="session-left-hints hide-on-mobile">{hintText}</p>
            )}
          </section>

          <section className="session-right-panel">
            {imageSrc ? (
              <>
                <div className="session-image-scroll">
                  <ZoomableImage
                    src={imageSrc}
                    alt="Question source scan"
                    previewButtonClassName="w-full h-full cursor-zoom-in"
                    enableDrawing
                    persistKey={currentQuestion.id}
                  />
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
        currentAnswered={Boolean(currentAttemptResult)}
        onPrev={() => {
          void nav("prev");
        }}
        onNext={() => {
          void nav("next");
        }}
        onSubmit={() => {
          void submit();
        }}
        onReveal={revealAnswer}
        revealed={isAnswerRevealed}
      />
      </div>

      {isAnswerRevealed && (
        <MobileRevealPopup
          correctAnswer={currentQuestion.answer.correct}
          onClose={() => setIsAnswerRevealed(false)}
          onMarkCorrect={() => handleMark("correct")}
          onMarkIncorrect={() => handleMark("incorrect")}
        />
      )}
    </div>
  );
}
