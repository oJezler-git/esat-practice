import type { SelfMarkResult } from "../../types/schema";

interface Props {
  correctAnswer: string;
  onMark: (result: SelfMarkResult) => void;
  onReveal: () => void;
  revealed: boolean;
  result?: SelfMarkResult;
  revealShortcutLabel: string;
  incorrectShortcutLabel: string;
  hideRevealOnMobile?: boolean;
}

export function SelfMarkPanel({
  correctAnswer,
  onMark,
  onReveal,
  revealed,
  result,
  revealShortcutLabel,
  incorrectShortcutLabel,
  hideRevealOnMobile = false,
}: Props) {
  if (result) {
    return (
      <div
        className={`selfmark-result-panel ${
          result === "correct"
            ? "selfmark-result-correct"
            : result === "incorrect"
              ? "selfmark-result-incorrect"
              : "selfmark-result-skipped"
        }`}
      >
        <div>
          <div className="selfmark-result-label">
            {result === "correct" ? "Result" : "Marked"}
          </div>
          <div className="selfmark-result-status">
          {result === "correct"
            ? "Marked correct"
            : result === "incorrect"
              ? "Marked incorrect"
              : "Skipped"}
          </div>
        </div>
        <div className="selfmark-answer-hero selfmark-answer-hero-compact ml-auto">
          <span className="selfmark-answer-kicker">Correct answer</span>
          <strong className="selfmark-answer-value">{correctAnswer}</strong>
        </div>
      </div>
    );
  }

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={onReveal}
        className={`selfmark-reveal-button ${hideRevealOnMobile ? "hide-on-mobile" : ""}`}
      >
        <span>Reveal answer</span>
        <span className="selfmark-shortcut-hint">{revealShortcutLabel}</span>
      </button>
    );
  }

  return (
    <div className="selfmark-panel">
      <div className="selfmark-answer-hero hide-on-mobile">
        <span className="selfmark-answer-kicker">Correct answer</span>
        <strong className="selfmark-answer-value">{correctAnswer}</strong>
      </div>

      <div className="selfmark-actions-wrap">
        <p className="selfmark-prompt">Did you get it right?</p>
        <div className="selfmark-actions">
          <button
            type="button"
            onClick={() => onMark("correct")}
            className="selfmark-action-button selfmark-action-button-correct"
          >
            <span>Correct</span>
            <span className="selfmark-shortcut-hint hide-on-mobile">{revealShortcutLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => onMark("incorrect")}
            className="selfmark-action-button selfmark-action-button-incorrect"
          >
            <span>Incorrect</span>
            <span className="selfmark-shortcut-hint hide-on-mobile">{incorrectShortcutLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
