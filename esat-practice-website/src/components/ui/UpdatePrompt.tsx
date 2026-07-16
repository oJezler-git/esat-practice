import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { fetchRecentCommits, relativeTime, type RecentCommit } from "./recentCommits";

// How often to ask the browser to re-check for a new service worker while the
// tab is open. Left-open tabs/installed PWAs never navigate, so without this
// they'd only pick up an update whenever the browser's own (much slower,
// unpredictable) background check happens to fire.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

interface UpdatePromptProps {
  reloadPage?: () => void;
}

export function UpdatePrompt({ reloadPage = () => window.location.reload() }: UpdatePromptProps = {}) {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [commits, setCommits] = useState<RecentCommit[] | null>(null);
  const [changesState, setChangesState] = useState<"idle" | "loading" | "error">("idle");
  const fetchStartedRef = useRef(false);

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

  // Fetch the changelog lazily — only once the user actually opens "What's new".
  // Keyed off a ref (not `expanded`) so collapsing/reopening won't abort or
  // re-trigger an in-flight request; the fetch is cheap and runs to completion.
  useEffect(() => {
    if (!expanded || fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    let active = true;
    setChangesState("loading");
    fetchRecentCommits()
      .then((result) => {
        if (!active) return;
        setCommits(result);
        setChangesState("idle");
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load recent commits", err);
        setChangesState("error");
      });
    return () => {
      active = false;
    };
  }, [expanded]);

  const isVisible = needRefresh || offlineReady;

  if (!isVisible) return null;

  function dismiss() {
    setNeedRefresh(false);
    setOfflineReady(false);
  }

  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <div className="update-prompt__row">
        <span className="update-prompt__message">
          {needRefresh ? "Update available" : "Ready to work offline"}
        </span>
        {needRefresh && (
          <button
            type="button"
            className="update-prompt__whatsnew"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="update-prompt__chevron" aria-hidden="true">
              ▸
            </span>
            What&rsquo;s new
          </button>
        )}
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
              setTimeout(() => reloadPage(), 1500);
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
      {needRefresh && expanded && (
        <div className="update-prompt__changes">
          {changesState === "loading" && (
            <p className="update-prompt__changes-note">Loading latest changes…</p>
          )}
          {changesState === "error" && (
            <p className="update-prompt__changes-note">Couldn&rsquo;t load the changelog.</p>
          )}
          {changesState === "idle" && commits && commits.length > 0 && (
            <ul className="update-prompt__commits">
              {commits.map((commit) => (
                <li key={commit.sha} className="update-prompt__commit">
                  <a
                    href={commit.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="update-prompt__commit-subject"
                  >
                    {commit.subject}
                  </a>
                  {commit.date && (
                    <span className="update-prompt__commit-date">{relativeTime(commit.date)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {changesState === "idle" && commits && commits.length === 0 && (
            <p className="update-prompt__changes-note">No recent changes found.</p>
          )}
        </div>
      )}
    </div>
  );
}
