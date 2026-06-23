import { useEffect, useState } from "react";
import { useLoadingProgress } from "../hooks/useLoadingProgress";
import {
  checkAlreadyPersisted,
  getDecision,
  isSupported,
  requestPersist,
  saveGranted,
  saveNever,
  saveRemindLater,
} from "../lib/persistentStorage";

type StorageState = "pending" | "prompt" | "granted" | "denied" | "resolved";

export function LoadingProgressDisplay() {
  const progress = useLoadingProgress();
  const [storage, setStorage] = useState<StorageState>("pending");

  useEffect(() => {
    if (!isSupported() || getDecision() !== "undecided") return;
    void checkAlreadyPersisted().then((persisted) => {
      if (persisted) {
        saveGranted();
      } else {
        setStorage("prompt");
      }
    });
  }, []);

  const isLoadingActive = progress.isLoading && progress.stage !== "idle";
  const showModal = isLoadingActive || storage === "prompt" || storage === "granted" || storage === "denied";

  if (!showModal) return null;

  async function handleEnable() {
    const granted = await requestPersist();
    if (granted) {
      saveGranted();
      setStorage("granted");
      setTimeout(() => setStorage("resolved"), 1800);
    } else {
      setStorage("denied");
    }
  }

  function handleRemind() {
    saveRemindLater();
    setStorage("resolved");
  }

  function handleNever() {
    saveNever();
    setStorage("resolved");
  }

  return (
    <div className="fullscreen-overlay" style={{ zIndex: 9999 }}>
      <div className="overlay-card">
        {isLoadingActive && (
          <>
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
          </>
        )}

        {(storage === "prompt" || storage === "granted" || storage === "denied") && (
          <>
            {isLoadingActive && <hr className="overlay-divider" />}
            {!isLoadingActive && (
              <p className="loading-status" style={{ marginBottom: "1rem" }}>
                Question bank ready
              </p>
            )}

            {storage === "granted" && (
              <p className="storage-result storage-result--ok">Persistent storage enabled.</p>
            )}

            {storage === "denied" && (
              <>
                <p className="storage-result storage-result--warn">
                  Your browser didn't grant persistent storage — this is usually automatic based
                  on engagement and browser settings. Try bookmarking the site and enabling it again.
                </p>
                <div className="storage-actions">
                  <button type="button" className="storage-btn-outline" onClick={handleRemind}>
                    Remind in 7 days
                  </button>
                  <button type="button" className="storage-btn-ghost" onClick={handleNever}>
                    Don't ask again
                  </button>
                </div>
              </>
            )}

            {storage === "prompt" && (
              <>
                <p className="storage-prompt-title">Enable persistent storage?</p>
                <p className="storage-prompt-body">
                  Browsers can clear local data when disk space is low. Persistent storage
                  prevents your progress from being wiped.
                </p>
                <div className="storage-actions">
                  <button
                    type="button"
                    className="storage-btn-enable"
                    onClick={() => { void handleEnable(); }}
                  >
                    Enable
                  </button>
                  <button type="button" className="storage-btn-outline" onClick={handleRemind}>
                    Remind in 7 days
                  </button>
                  <button type="button" className="storage-btn-ghost" onClick={handleNever}>
                    Never
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
