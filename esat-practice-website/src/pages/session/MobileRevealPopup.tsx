interface MobileRevealPopupProps {
  correctAnswer: string;
  onClose: () => void;
  onMarkCorrect: () => void;
  onMarkIncorrect: () => void;
}

export function MobileRevealPopup({ correctAnswer, onClose, onMarkCorrect, onMarkIncorrect }: MobileRevealPopupProps) {
  return (
    <div className="show-on-mobile selfmark-mobile-popup-overlay">
      <div className="selfmark-mobile-popup-content">
        <button
          type="button"
          onClick={onClose}
          className="selfmark-mobile-close-button"
        >
          ✕
        </button>
        <div className="selfmark-answer-hero">
          <span className="selfmark-answer-kicker">Correct answer</span>
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
