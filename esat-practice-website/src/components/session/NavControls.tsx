interface Props {
  currentIndex: number;
  totalCount: number;
  currentAnswered: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onExclude: () => void;
  onReveal?: () => void;
  revealed?: boolean;
}

export function NavControls({
  currentIndex,
  totalCount,
  currentAnswered,
  onPrev,
  onNext,
  onSubmit,
  onExclude,
  onReveal,
  revealed = false,
}: Props) {
  const isLast = currentIndex === totalCount - 1;

  return (
    <footer className="sk-session-bottom">
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="sk-navbtn"
      >
        <span className="hide-on-mobile">Prev</span>
        <span className="show-on-mobile">←</span>
      </button>

      <button
        type="button"
        onClick={onExclude}
        className="sk-navbtn-exclude hide-on-desktop show-inline-on-mobile"
        title="Exclude"
      >
        ✖
      </button>

      {onReveal && !revealed && (
        <button
          type="button"
          onClick={onReveal}
          className="sk-navbtn-reveal hide-on-desktop show-inline-on-mobile"
        >
          Reveal
        </button>
      )}

      <div className="sk-navbtn-spacer" />

      {isLast ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!currentAnswered}
          className="sk-navbtn-primary"
        >
          <span>Submit session</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="sk-navbtn"
        >
          <span className="hide-on-mobile">Next</span>
          <span className="show-on-mobile">→</span>
        </button>
      )}
    </footer>
  );
}
