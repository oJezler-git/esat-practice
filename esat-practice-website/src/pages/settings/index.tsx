import { useEffect, useReducer, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useExcludedQuestionStore } from "../../lib/excludedQuestionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import {
  clearOfflineImageCache,
  downloadAllImagesForOffline,
  getCurrentDataVersion,
  getOfflineDownloadState,
  type OfflineDownloadState,
} from "../../lib/offlineDownload";
import { DataManagementSection } from "../../components/DataManagementSection";
import { CloudSyncSection } from "../../components/CloudSyncSection";
import {
  AskClaudeSection,
  BehaviourSection,
  DisplaySection,
  KeyboardShortcutsSection,
  QuestionPoolSection,
  SessionDefaultsSection,
} from "./sections";

export default function Settings() {
  const { settings, update, reset } = useSettingsStore();
  const { excludedQuestions, includeQuestion } = useExcludedQuestionStore();

  return (
    <div className="page-shell max-w-3xl sk-settings">
      <div className="sk-frame">
        <span className="sk-screw sk-screw--tl" />
        <span className="sk-screw sk-screw--tr" />
        <span className="sk-screw sk-screw--bl" />
        <span className="sk-screw sk-screw--br" />

      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-medium">Settings</h1>
          <p className="text-sm text-muted mt-1">
            Configure your default session flow and exam preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset all settings to defaults?")) {
              reset();
            }
          }}
          className="px-3 py-1.5 text-sm border border-subtle rounded-lg text-muted hover:border-strong hover:text-secondary transition-colors"
        >
          Reset to defaults
        </button>
      </div>

      <CloudSyncSection />

      <SessionDefaultsSection settings={settings} update={update} />
      <BehaviourSection settings={settings} update={update} />
      <KeyboardShortcutsSection settings={settings} update={update} />
      <DisplaySection settings={settings} update={update} />
      <QuestionPoolSection
        settings={settings}
        update={update}
        excludedQuestions={excludedQuestions}
        includeQuestion={includeQuestion}
      />
      <AskClaudeSection settings={settings} update={update} />

      <OfflineSection />
      <DataManagementSection />
      </div>
    </div>
  );
}

type OfflineState = {
  saved: OfflineDownloadState | null;
  currentVersion: string | null;
  progress: { done: number; total: number } | null;
  error: boolean;
  highlighted: boolean;
};

type OfflineAction =
  | { type: "set_version"; version: string | null }
  | { type: "download_start" }
  | { type: "download_progress"; done: number; total: number }
  | { type: "download_done"; saved: OfflineDownloadState | null }
  | { type: "download_cancel" }
  | { type: "download_error" }
  | { type: "clear" }
  | { type: "highlight" }
  | { type: "unhighlight" };

function offlineReducer(state: OfflineState, action: OfflineAction): OfflineState {
  switch (action.type) {
    case "set_version":
      return { ...state, currentVersion: action.version };
    case "download_start":
      return { ...state, error: false, progress: { done: 0, total: 0 } };
    case "download_progress":
      return { ...state, progress: { done: action.done, total: action.total } };
    case "download_done":
      return { ...state, progress: null, saved: action.saved };
    case "download_cancel":
      return { ...state, progress: null };
    case "download_error":
      return { ...state, error: true, progress: null };
    case "clear":
      return { ...state, saved: null, error: false };
    case "highlight":
      return { ...state, highlighted: true };
    case "unhighlight":
      return { ...state, highlighted: false };
    default:
      return state;
  }
}

function OfflineSection() {
  const [state, dispatch] = useReducer(offlineReducer, undefined, () => ({
    saved: getOfflineDownloadState(),
    currentVersion: null,
    progress: null,
    error: false,
    highlighted: false,
  }));
  const abortRef = useRef<AbortController | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const location = useLocation();

  const { saved, currentVersion, progress, error, highlighted } = state;

  useEffect(() => {
    void getCurrentDataVersion().then((v) => dispatch({ type: "set_version", version: v }));
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    const locState = location.state as { highlight?: string } | null;
    if (locState?.highlight !== "offline") return;
    const frame = requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      dispatch({ type: "highlight" });
      const t = setTimeout(() => dispatch({ type: "unhighlight" }), 2000);
      return () => clearTimeout(t);
    });
    return () => cancelAnimationFrame(frame);
  }, [location.state]);

  async function startDownload() {
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "download_start" });
    try {
      await downloadAllImagesForOffline(
        (done, total) => dispatch({ type: "download_progress", done, total }),
        controller.signal,
      );
      dispatch({ type: "download_done", saved: getOfflineDownloadState() });
    } catch {
      dispatch({ type: "download_error" });
    } finally {
      abortRef.current = null;
    }
  }

  async function handleClear() {
    await clearOfflineImageCache();
    dispatch({ type: "clear" });
  }

  const isDownloading = progress !== null;

  return (
    <section
      ref={sectionRef}
      id="offline-section"
      className={`mb-8 border rounded-xl overflow-hidden transition-colors duration-300 ${highlighted ? "offline-section--highlight" : "border-subtle bg-soft"}`}
    >
      <div className="px-4 py-3.5 border-b border-subtle">
        <h2 className="text-sm font-medium text-muted">Offline</h2>
        <p className="text-xs text-muted mt-1">
          Pre-download question images (~47 MB) to use the app without a connection.
        </p>
      </div>
      <div className="px-4 py-3.5">
        {isDownloading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {progress.total === 0
                  ? "Preparing…"
                  : `${progress.done} / ${progress.total} images`}
              </span>
              <button
                type="button"
                onClick={() => { abortRef.current?.abort(); dispatch({ type: "download_cancel" }); }}
                className="text-muted hover:text-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
            <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-150"
                style={{
                  width: progress.total > 0
                    ? `${Math.round((progress.done / progress.total) * 100)}%`
                    : "0%",
                }}
              />
            </div>
          </div>
        ) : saved ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">
                {saved.count} images cached
              </p>
              <p className="text-xs text-muted mt-0.5">
                {currentVersion && saved.dataVersion && currentVersion !== saved.dataVersion
                  ? <span className="text-amber">New question data available — refresh to update</span>
                  : <>Downloaded {new Date(saved.downloadedAt).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}</>
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { void startDownload(); }}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  currentVersion && saved.dataVersion && currentVersion !== saved.dataVersion
                    ? "border border-warning text-amber hover:bg-amber-soft"
                    : "border border-subtle text-secondary hover:border-strong"
                }`}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => { void handleClear(); }}
                className="px-3 py-1.5 text-sm border border-danger text-danger-text rounded-lg hover:bg-danger-soft transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              {error ? "Download failed — check your connection." : "Not downloaded"}
            </p>
            <button
              type="button"
              onClick={() => { void startDownload(); }}
              className="px-3 py-1.5 text-sm border border-subtle text-secondary rounded-lg hover:border-strong transition-colors"
            >
              {error ? "Retry" : "Download"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
