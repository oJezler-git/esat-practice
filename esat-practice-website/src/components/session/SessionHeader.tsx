interface Props {
  currentIndex: number;
  totalCount: number;
  timeRemaining?: number;
  isFlagged: boolean;
  onFlag: () => void;
}

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SessionHeader({
  currentIndex,
  totalCount,
  timeRemaining,
  isFlagged,
  onFlag,
}: Props) {
  const progress = totalCount > 0 ? ((currentIndex + 1) / totalCount) * 100 : 0;
  const isLow = timeRemaining !== undefined && timeRemaining < 60_000;

  return (
    <header className="z-10 bg-gray-50 border-b border-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-4">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {timeRemaining !== undefined && (
          <span
            className={`text-sm font-mono font-medium tabular-nums ${
              isLow ? "text-red-500" : "text-gray-500"
            }`}
          >
            {formatTime(timeRemaining)}
          </span>
        )}

        <button
          type="button"
          onClick={onFlag}
          title="Flag question (F)"
          className={`p-1.5 rounded transition-colors ${
            isFlagged ? "text-amber-500 bg-amber-50" : "text-gray-300 hover:text-gray-700"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2h9l-2.5 3.5L11 9H2V2z" />
            <line
              x1="2"
              y1="2"
              x2="2"
              y2="15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
