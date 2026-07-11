interface MobileRevealPopupProps {
  correctAnswer: string;
  onClose: () => void;
  onMarkCorrect: () => void;
  onMarkIncorrect: () => void;
}

export function MobileRevealPopup({ correctAnswer, onClose, onMarkCorrect, onMarkIncorrect }: MobileRevealPopupProps) {
  return (
    <div className="show-on-mobile selfmark-mobile-popup-overlay">
      <div
        className="selfmark-mobile-popup-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-reveal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="selfmark-mobile-close-button"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="selfmark-answer-hero">
          <span id="mobile-reveal-title" className="selfmark-answer-kicker">Correct answer</span>
          <strong className="selfmark-answer-value">
            {correctAnswer}
          </strong>
        </div>
        <p className="selfmark-prompt">Did you get it right?</p>
        <div className="selfmark-actions">
          <button
            type="button"
            onClick={onMarkCorrect}
            className="selfmark-action-button selfmark-action-button-correct"
          >
            <span>Correct</span>
          </button>
          <button
            type="button"
            onClick={onMarkIncorrect}
            className="selfmark-action-button selfmark-action-button-incorrect"
          >
            <span>Incorrect</span>
          </button>
        </div>
      </div>
    </div>
  );
}
