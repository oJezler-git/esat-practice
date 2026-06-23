import { useLoadingProgress } from "../hooks/useLoadingProgress";

export function LoadingProgressDisplay() {
  const progress = useLoadingProgress();

  const isLoadingActive = progress.isLoading && progress.stage !== "idle";
  if (!isLoadingActive) return null;

  return (
    <div className="fullscreen-overlay" style={{ zIndex: 9999 }}>
      <div className="overlay-card">
        <p className="overlay-card-title">Preparing question bank</p>

        <div className="progress-row">
          <span className="progress-label">Progress</span>
          <span className="progress-pct">{progress.percentComplete}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress.percentComplete}%` }} />
        </div>

        {progress.stage === "packs" && progress.currentPack && (
          <div className="pack-info">
            <span className="pack-info-name">{progress.currentPack}</span>
            <span className="pack-info-count">
              {progress.packIndex + 1} / {progress.totalPacks}
            </span>
          </div>
        )}

        <p className="loading-status">{progress.message}</p>
      </div>
    </div>
  );
}
