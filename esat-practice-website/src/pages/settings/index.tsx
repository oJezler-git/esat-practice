import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";
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
import {
  DEFAULT_SHORTCUTS,
  formatShortcutKey,
  normalizeShortcutKey,
  type AutoExcludeOn,
  type ClaudeMode,
  type ShortcutAction,
  type ShortcutMap,
  type UserSettings,
} from "../../types/settings";
import { AskClaudeInfoModal } from "../../components/AskClaudeInfoModal";
import { DataManagementSection } from "../../components/DataManagementSection";
import { CloudSyncSection } from "../../components/CloudSyncSection";

const SHORTCUT_FIELDS: Array<{
  action: ShortcutAction;
  label: string;
  description: string;
}> = [
  {
    action: "revealCorrect",
    label: "Reveal / mark correct",
    description: "Reveals the answer first, then marks the question correct.",
  },
  {
    action: "incorrect",
    label: "Mark incorrect",
    description: "Marks the revealed question as incorrect.",
  },
  {
    action: "prev",
    label: "Previous question",
    description: "Moves to the previous question in the session.",
  },
  {
    action: "next",
    label: "Next question",
    description: "Moves to the next question.",
  },
  {
    action: "flag",
    label: "Flag question",
    description: "Toggles the flagged state for the current question.",
  },
  {
    action: "skip",
    label: "Skip question",
    description: "Skips the current question.",
  },
];


export default function Settings() {
  const { settings, update, reset } = useSettingsStore();
  const { excludedQuestions, includeQuestion } = useExcludedQuestionStore();
  const [showClaudeModal, setShowClaudeModal] = useState(false);

  function updateShortcut(action: ShortcutAction, key: string) {
    const nextShortcuts: ShortcutMap = {
      ...settings.shortcuts,
      [action]: key,
    };

    const duplicateAction = Object.entries(nextShortcuts).find(
      ([candidateAction, candidateKey]) =>
        candidateAction !== action && candidateKey === key,
    )?.[0] as ShortcutAction | undefined;

    if (duplicateAction) {
      nextShortcuts[duplicateAction] = settings.shortcuts[action];
    }

    update({ shortcuts: nextShortcuts });
  }

  return (
    <div className="page-shell max-w-3xl">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-medium">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
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
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
        >
          Reset to defaults
        </button>
      </div>


      <CloudSyncSection />


      <Section
        title="Session defaults"
        description="Choose how new practice sessions should start."
      >
        <Field label="Default mode">
          <Select
            value={settings.defaultMode}
            onChange={(value) =>
              update({ defaultMode: value as UserSettings["defaultMode"] })
            }
            options={[
              { value: "untimed", label: "Untimed" },
              { value: "timed", label: "Timed" },
              { value: "topic", label: "Topic focus" },
              { value: "mixed", label: "Mixed" },
            ]}
          />
        </Field>

        <Field label="Default question count">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={settings.defaultQuestionCount}
              onChange={(event) =>
                update({ defaultQuestionCount: Number(event.target.value) })
              }
              className="w-40 accent-indigo-500"
            />
            <input
              type="number"
              min={5}
              max={60}
              value={settings.defaultQuestionCount}
              onChange={(event) => {
                const value = Math.max(5, Math.min(60, Number(event.target.value)));
                if (!Number.isNaN(value)) update({ defaultQuestionCount: value });
              }}
              style={{ width: "4.5rem", textAlign: "right" }}
              className="text-sm"
            />
          </div>
        </Field>

        <Field label="Seconds per question (timed mode)">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={600}
              step={5}
              value={settings.timedSecondsPerQ}
              onChange={(event) =>
                update({ timedSecondsPerQ: Number(event.target.value) })
              }
              className="w-40 accent-indigo-500"
            />
            <input
              type="number"
              min={10}
              max={600}
              value={settings.timedSecondsPerQ}
              onChange={(event) => {
                const value = Math.max(10, Math.min(600, Number(event.target.value)));
                if (!Number.isNaN(value)) update({ timedSecondsPerQ: value });
              }}
              style={{ width: "4.5rem", textAlign: "right" }}
              className="text-sm"
            />
          </div>
        </Field>
      </Section>

      <Section
        title="Behaviour"
        description="Tweak how sessions behave while you are answering."
      >
        <Field
          label="Exam mode"
          description="Hide topic tags, confidence scores, and metadata during sessions."
        >
          <Toggle
            checked={settings.examMode}
            onChange={(value) => update({ examMode: value })}
          />
        </Field>

        <Field
          label="Auto-advance"
          description="Move to the next question automatically after marking your answer."
        >
          <Toggle
            checked={settings.autoAdvance}
            onChange={(value) => update({ autoAdvance: value })}
          />
        </Field>

        <Field
          label="Fullscreen on start"
          description="Automatically enter fullscreen mode when starting a session."
        >
          <Toggle
            checked={settings.fullscreenOnStart}
            onChange={(value) => update({ fullscreenOnStart: value })}
          />
        </Field>

        {settings.autoAdvance && (
          <Field
            label="Auto-advance delay"
            description="How long to show the result before advancing."
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={3000}
                step={100}
                value={settings.autoAdvanceDelayMs ?? 600}
                onChange={(event) =>
                  update({ autoAdvanceDelayMs: Number(event.target.value) })
                }
                className="w-40 accent-indigo-500"
              />
              <span className="text-sm text-gray-600 text-right tabular-nums" style={{ minWidth: "3rem", textAlign: "right" }}>
                {(settings.autoAdvanceDelayMs ?? 600) === 0
                  ? "Instant"
                  : `${((settings.autoAdvanceDelayMs ?? 600) / 1000).toFixed(1)}s`}
              </span>
            </div>
          </Field>
        )}

        <Field
          label="Show keyboard hints"
          description="Display a shortcut reminder below each question."
        >
          <Toggle
            checked={settings.showKeyboardHints}
            onChange={(value) => update({ showKeyboardHints: value })}
          />
        </Field>
      </Section>

      <Section
        title="Keyboard shortcuts"
        description="These shortcuts are saved locally and used during practice sessions."
      >
        {SHORTCUT_FIELDS.map(({ action, label, description }) => (
          <Field key={action} label={label} description={description}>
            <ShortcutInput
              value={settings.shortcuts[action]}
              defaultValue={DEFAULT_SHORTCUTS[action]}
              onChange={(value) => updateShortcut(action, value)}
            />
          </Field>
        ))}
      </Section>

      <Section
        title="Display"
        description="Choose your reading comfort preferences."
      >
        <Field
          label="Interface font"
          description="Applied across all pages and controls."
        >
          <Select
            value={settings.fontPreset}
            onChange={(value) =>
              update({ fontPreset: value as UserSettings["fontPreset"] })
            }
            options={[
              { value: "academic", label: "Academic (Manrope)" },
              { value: "premium", label: "Editorial (Manrope + Fraunces)" },
              { value: "readable", label: "Accessible (Atkinson Hyperlegible)" },
              { value: "modern", label: "Modern (Outfit)" },
              { value: "technical", label: "Technical (IBM Plex Sans)" },
              { value: "inter", label: "Clean (Inter)" },
              { value: "monospace", label: "Monospace (JetBrains Mono)" },
            ]}
          />
        </Field>

        <Field label="Question font size">
          <Select
            value={settings.fontSize}
            onChange={(value) =>
              update({ fontSize: value as UserSettings["fontSize"] })
            }
            options={[
              { value: "sm", label: "Small" },
              { value: "md", label: "Medium (default)" },
              { value: "lg", label: "Large" },
            ]}
          />
        </Field>
      </Section>

      <Section
        title="Question pool"
        description="Control which questions appear in new sessions."
      >
        <Field
          label="Auto-exclude answered questions"
          description="After each session, qualifying questions are removed from future sessions."
        >
          <Toggle
            checked={settings.autoExclude}
            onChange={(value) => update({ autoExclude: value })}
          />
        </Field>

        {settings.autoExclude && (
          <Field
            label="Exclude when"
            description="Which results count as done."
          >
            <Select
              value={settings.autoExcludeOn}
              onChange={(value) => update({ autoExcludeOn: value as AutoExcludeOn })}
              options={[
                { value: "attempted", label: "Attempted (correct or incorrect)" },
                { value: "correct", label: "Correct only" },
                { value: "any", label: "Seen (including skipped)" },
              ]}
            />
          </Field>
        )}

        {excludedQuestions.length > 0 && (
          <Field
            label="Excluded questions"
            description={`${excludedQuestions.length} question${excludedQuestions.length !== 1 ? "s" : ""} hidden from sessions. Manage individual questions in the question bank.`}
          >
            <button
              type="button"
              onClick={async () => {
                if (window.confirm(`Re-add all ${excludedQuestions.length} excluded questions to the pool?`)) {
                  await Promise.all(excludedQuestions.map((eq) => includeQuestion(eq.question_id)));
                }
              }}
              className="storage-btn-outline"
            >
              Reset pool
            </button>
          </Field>
        )}
      </Section>

      <Section
        title="Ask Claude"
        description="Control how the Ask Claude button sends questions to Claude."
      >
        <Field
          label="Integration mode"
          description="Controls whether the button uses the Tampermonkey extension or manual copy & paste."
        >
          <Select
            value={settings.claudeMode ?? "auto"}
            onChange={(value) => update({ claudeMode: value as ClaudeMode })}
            options={[
              { value: "auto", label: "Detect automatically (default)" },
              { value: "extension", label: "Always use extension" },
              { value: "manual", label: "Always copy & paste" },
            ]}
          />
        </Field>
        <div className="px-4 py-3">
          <button
            type="button"
            className="settings-text-link"
            onClick={() => setShowClaudeModal(true)}
          >
            Installation guide &amp; how it works →
          </button>
        </div>
      </Section>

      {showClaudeModal && <AskClaudeInfoModal onClose={() => setShowClaudeModal(false)} />}

      <OfflineSection />
      <DataManagementSection />
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
      className={`mb-8 border rounded-xl overflow-hidden transition-colors duration-300 ${highlighted ? "offline-section--highlight" : "border-gray-200 bg-white"}`}
    >
      <div className="px-4 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-medium text-gray-500">Offline</h2>
        <p className="text-xs text-gray-400 mt-1">
          Pre-download question images (~47 MB) to use the app without a connection.
        </p>
      </div>
      <div className="px-4 py-3.5">
        {isDownloading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {progress.total === 0
                  ? "Preparing…"
                  : `${progress.done} / ${progress.total} images`}
              </span>
              <button
                type="button"
                onClick={() => { abortRef.current?.abort(); dispatch({ type: "download_cancel" }); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-150"
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
              <p className="text-sm text-gray-700">
                {saved.count} images cached
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {currentVersion && saved.dataVersion && currentVersion !== saved.dataVersion
                  ? <span className="text-amber-600">New question data available — refresh to update</span>
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
                    ? "border border-amber-300 text-amber-700 hover:bg-amber-50"
                    : "border border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => { void handleClear(); }}
                className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {error ? "Download failed — check your connection." : "Not downloaded"}
            </p>
            <button
              type="button"
              onClick={() => { void startDownload(); }}
              className="px-3 py-1.5 text-sm border border-gray-200 text-gray-700 rounded-lg hover:border-gray-300 transition-colors"
            >
              {error ? "Retry" : "Download"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8 border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-medium text-gray-500">{title}</h2>
        <p className="text-xs text-gray-400 mt-1">{description}</p>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </section>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div>
        <div className="text-sm text-gray-700">{label}</div>
        {description && (
          <div className="text-xs text-gray-400 mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`settings-toggle ${checked ? "settings-toggle--on" : ""}`}
    >
      <span className="settings-toggle__knob" />
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:border-indigo-400"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ShortcutInput({
  value,
  defaultValue,
  onChange,
}: {
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const isModified = value !== defaultValue;

  return (
    <div className="shortcut-input-row">
      <button
        type="button"
        onFocus={() => setListening(true)}
        onBlur={() => setListening(false)}
        onKeyDown={(event) => {
          event.preventDefault();
          const nextKey = normalizeShortcutKey(event.key);
          if (nextKey) {
            onChange(nextKey);
            event.currentTarget.blur();
          }
        }}
        className={`shortcut-key-btn${listening ? " shortcut-key-btn--listening" : ""}`}
      >
        {listening ? "Press a key…" : <kbd>{formatShortcutKey(value)}</kbd>}
      </button>
      {isModified && (
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className="shortcut-reset-btn"
          style={{ order: -1 }}
        >
          Reset
        </button>
      )}
    </div>
  );
}
