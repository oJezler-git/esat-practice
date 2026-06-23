interface Props {
  currentIndex: number;
  totalCount: number;
  currentAnswered: boolean;
  onPrev: () => void;
  onNext: () => void;
  onExclude: () => void;
  onSubmit: () => void;
  onReveal?: () => void;
  revealed?: boolean;
}

export function NavControls({
  currentIndex,
  totalCount,
  currentAnswered,
  onPrev,
  onNext,
  onExclude,
  onSubmit,
  onReveal,
  revealed = false,
}: Props) {
  const isLast = currentIndex === totalCount - 1;

  return (
    <footer className="bg-gray-50 border-t border-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-30 hover:border-gray-300 transition-colors"
        >
          <span className="hide-on-mobile">Prev</span>
          <span className="show-on-mobile">←</span>
        </button>

        <button
          type="button"
          onClick={onExclude}
          className="px-4 py-2 text-sm text-rose-600 hover:text-rose-700 transition-colors"
        >
          Exclude
        </button>

        {onReveal && !revealed && (
          <button
            type="button"
            onClick={onReveal}
            className="px-4 py-2 text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-medium hide-on-desktop show-inline-on-mobile"
          >
            Reveal
          </button>
        )}

        <div className="flex-1" />

        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!currentAnswered}
            className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit session
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            <span className="hide-on-mobile">Next</span>
            <span className="show-on-mobile">→</span>
          </button>
        )}
      </div>
    </footer>
  );
}
