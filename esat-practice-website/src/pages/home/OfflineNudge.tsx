import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOfflineDownloadState } from "../../lib/offlineDownload";
import { isInstalledPWA } from "../../lib/pwa";

export function OfflineNudge() {
  const navigate = useNavigate();
  const [showOfflineNudge, setShowOfflineNudge] = useState(
    () => isInstalledPWA() && !getOfflineDownloadState() && localStorage.getItem("offline_nudge_dismissed") !== "true"
  );

  if (!showOfflineNudge) {
    return null;
  }

  return (
    <div className="offline-nudge mb-8">
      <div className="offline-nudge__body">
        <p className="offline-nudge__title">Download images for full offline use</p>
        <p className="offline-nudge__desc">
          Question images aren't cached yet — download them once in Settings to use the app without a connection.
        </p>
      </div>
      <div className="offline-nudge__actions">
        <button
          type="button"
          className="offline-nudge__dismiss"
          onClick={() => {
            localStorage.setItem("offline_nudge_dismissed", "true");
            setShowOfflineNudge(false);
          }}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="offline-nudge__cta"
          onClick={() => {
            localStorage.setItem("offline_nudge_dismissed", "true");
            setShowOfflineNudge(false);
            navigate("/settings", { state: { highlight: "offline" } });
          }}
        >
          Go to Settings
        </button>
      </div>
    </div>
  );
}
