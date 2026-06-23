import { useEffect, useState } from "react";
import { useLoadingProgress } from "../../hooks/useLoadingProgress";
import {
  checkAlreadyPersisted,
  getDecision,
  isSupported,
  requestPersist,
  saveGranted,
  saveNever,
  saveRemindLater,
} from "../../lib/persistentStorage";

type Phase = "prompt" | "granted" | "denied" | "exiting";

export function PersistentStoragePrompt() {
  const progress = useLoadingProgress();
  const [phase, setPhase] = useState<Phase | null>(null);

  useEffect(() => {
    if (!isSupported() || getDecision() !== "undecided") return;
    void checkAlreadyPersisted().then((persisted) => {
      if (persisted) {
        saveGranted();
      } else {
        setPhase("prompt");
      }
    });
  }, []);

  const isLoadingActive = progress.isLoading && progress.stage !== "idle";
  if (!phase || isLoadingActive) return null;
  // LoadingProgressDisplay may have resolved the decision while loading was active
  if (getDecision() !== "undecided") return null;

  function dismiss() {
    setPhase("exiting");
    setTimeout(() => setPhase(null), 200);
  }

  async function handleEnable() {
    const granted = await requestPersist();
    if (granted) {
      saveGranted();
      setPhase("granted");
      setTimeout(dismiss, 1800);
    } else {
      setPhase("denied");
    }
  }

  function handleRemind() {
    saveRemindLater();
    dismiss();
  }

  function handleNever() {
    saveNever();
    dismiss();
  }

  const exiting = phase === "exiting";

  return (
    <div
      className={`fullscreen-overlay ${exiting ? "modal-backdrop-exit" : "modal-backdrop-enter"}`}
      style={{ zIndex: 50 }}
      onClick={handleRemind}
    >
      <div
        className={`overlay-card ${exiting ? "modal-content-exit" : "modal-content-enter"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "prompt" && (
          <>
            <p className="storage-prompt-title">Enable persistent storage?</p>
            <p className="storage-prompt-body">
              Browsers can clear local data when disk space is low. Persistent storage prevents
              your progress from being wiped.
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

        {phase === "granted" && (
          <p className="storage-result storage-result--ok">Persistent storage enabled.</p>
        )}

        {phase === "denied" && (
          <>
            <p className="storage-result storage-result--warn">
              Your browser didn't grant persistent storage — this is usually automatic based on
              engagement and browser settings. Try bookmarking the site and enabling it again.
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
      </div>
    </div>
  );
}
