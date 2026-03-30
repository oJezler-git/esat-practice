interface Props {
  currentIndex: number;
  totalCount: number;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onSubmit: () => void;
}

export function NavControls({
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  onSkip,
  onSubmit,
}: Props) {
  const isLast = currentIndex === totalCount - 1;

  return (
    <footer className="sticky bottom-0 bg-white border-t border-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-30 hover:border-gray-300 transition-colors"
        >
          Prev
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Skip
        </button>

        <div className="flex-1" />

        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Submit session
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            Next
          </button>
        )}
      </div>
    </footer>
  );
}
