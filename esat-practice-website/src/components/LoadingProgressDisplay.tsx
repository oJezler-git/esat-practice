import { useLoadingProgress } from "../hooks/useLoadingProgress";

export function LoadingProgressDisplay() {
  const progress = useLoadingProgress();

  if (!progress.isLoading || progress.stage === "idle") {
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" style={{ zIndex: 9999 }}>
      <div 
        className="w-full max-w-sm p-6 rounded-2xl border shadow-xl"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderColor: 'var(--border-subtle)'
        }}
      >
        <h2 className="text-lg font-semibold mb-6 text-center" style={{ color: 'var(--text-primary)' }}>Preparing Question Bank</h2>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs mb-2.5">
            <span style={{ color: 'var(--text-muted)' }}>Overall Progress</span>
            <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>{progress.percentComplete}%</span>
          </div>
          <div className="w-full h-3 rounded-full border overflow-hidden bg-gray-700/30" style={{ borderColor: 'var(--border-subtle)' }}>
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{ 
                width: `${progress.percentComplete}%`, 
                backgroundColor: 'var(--accent)',
                boxShadow: '0 0 10px var(--accent)'
              }}
            />
          </div>
        </div>

        {/* Pack info */}
        {progress.stage === "packs" && progress.currentPack && (
          <div className="px-4 py-3 mb-6 rounded-xl border bg-black/20" style={{ borderColor: 'var(--border-subtle)' }}>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{progress.currentPack}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Pack {progress.packIndex + 1} of {progress.totalPacks}
            </p>
          </div>
        )}

        {/* Status message */}
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{progress.message}</p>
          {progress.bytesLoaded > 0 && (
            <p className="text-xs mt-1.5 font-mono opacity-80" style={{ color: 'var(--text-muted)' }}>
              {Math.round(progress.bytesLoaded / 1024 / 1024)}MB /{" "}
              {Math.round(progress.totalBytes / 1024 / 1024)}MB
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
