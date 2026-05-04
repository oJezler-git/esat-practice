import { useLoadingProgress } from "../hooks/useLoadingProgress";

export function LoadingProgressDisplay() {
  const progress = useLoadingProgress();

  if (!progress.isLoading || progress.stage === "idle") {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] px-4">
      <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl shadow-[0_20px_50px_rgb(0_0_0_/_0.4)] p-8 max-w-sm w-full">
        <h2 className="text-xl font-display font-medium mb-6 text-[var(--text-primary)]">
          Preparing Questions
        </h2>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-[var(--text-muted)]">
              Overall
            </span>
            <span className="text-sm font-mono text-[var(--accent-strong)]">
              {progress.percentComplete}%
            </span>
          </div>
          <div className="w-full h-2 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300 ease-out"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>

        {/* Pack info */}
        {progress.stage === "packs" && progress.currentPack && (
          <div className="mb-6 p-4 bg-[var(--surface-2)] rounded-xl border border-[var(--border-subtle)]">
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
              {progress.currentPack}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Pack {progress.packIndex + 1} of {progress.totalPacks}
            </p>
          </div>
        )}

        {/* Status message */}
        <div className="text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-2">{progress.message}</p>
          <p className="text-xs text-[var(--text-muted)] font-mono">
            {progress.bytesLoaded > 0 && (
              <>
                {Math.round(progress.bytesLoaded / 1024 / 1024)}MB /{" "}
                {Math.round(progress.totalBytes / 1024 / 1024)}MB
              </>
            )}
          </p>
        </div>

        {/* Loading spinner */}
        <div className="mt-8 flex justify-center">
          <div className="w-6 h-6 border-2 border-[var(--border-subtle)] border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}
