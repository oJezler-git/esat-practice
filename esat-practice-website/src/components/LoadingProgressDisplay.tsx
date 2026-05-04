import { useLoadingProgress } from "../hooks/useLoadingProgress";

export function LoadingProgressDisplay() {
  const progress = useLoadingProgress();

  if (!progress.isLoading || progress.stage === "idle") {
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" style={{ zIndex: 9999 }}>
      <div 
        className="w-full max-w-sm p-6 rounded-xl border"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderColor: 'var(--border-subtle)'
        }}
      >
        <h2 className="text-base font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>Preparing Question Bank</h2>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: 'var(--text-muted)' }}>Overall Progress</span>
            <span className="font-mono" style={{ color: 'var(--accent)' }}>{progress.percentComplete}%</span>
          </div>
          <div className="w-full h-2 rounded-full border overflow-hidden" style={{ backgroundColor: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}>
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{ width: `${progress.percentComplete}%`, backgroundColor: 'var(--accent)' }}
            />
          </div>
        </div>

        {/* Pack info */}
        {progress.stage === "packs" && progress.currentPack && (
          <div className="px-4 py-3 mb-4 rounded-lg border" style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-subtle)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{progress.currentPack}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Pack {progress.packIndex + 1} of {progress.totalPacks}
            </p>
          </div>
        )}

        {/* Status message */}
        <div className="text-center mb-6">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{progress.message}</p>
          {progress.bytesLoaded > 0 && (
            <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
              {Math.round(progress.bytesLoaded / 1024 / 1024)}MB /{" "}
              {Math.round(progress.totalBytes / 1024 / 1024)}MB
            </p>
          )}
        </div>

        {/* Loading spinner */}
        <div className="flex justify-center">
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)' }} />
        </div>
      </div>
    </div>
  );
}
