import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// How often to ask the browser to re-check for a new service worker while the
// tab is open. Left-open tabs/installed PWAs never navigate, so without this
// they'd only pick up an update whenever the browser's own (much slower,
// unpredictable) background check happens to fire.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration;
    },
  });

  useEffect(() => {
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        void registrationRef.current?.update();
      }
    };

    const intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

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
