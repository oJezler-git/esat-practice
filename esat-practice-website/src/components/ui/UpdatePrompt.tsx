import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    const t = window.setTimeout(() => setOfflineReady(false), 10000);
    return () => window.clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  const isVisible = needRefresh || offlineReady;

  if (!isVisible) return null;

  function dismiss() {
    setNeedRefresh(false);
    setOfflineReady(false);
  }

  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <span className="update-prompt__message">
        {needRefresh ? "Update available" : "Ready to work offline"}
      </span>
      {needRefresh && (
        <button
          type="button"
          className="update-prompt__reload"
          onClick={() => {
            void updateServiceWorker(true);
            // Fallback: if registration.waiting was already null (mobile browsers
            // can auto-activate a waiting SW when the app is foregrounded), the
            // controllerchange event never fires. Force a reload after a short
            // delay so the user isn't left with a button that silently does nothing.
            setTimeout(() => window.location.reload(), 1500);
          }}
        >
          Reload
        </button>
      )}
      <button
        type="button"
        className="update-prompt__close"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
