import { useEffect, useReducer, useRef } from "react";
import {
  ADJECTIVES,
  NOUNS,
  createSyncKeyWithWords,
  generateSyncKey,
  getLastPush,
  getSyncKey,
  pullFromCloud,
  pushToCloud,
  setSyncKey,
  validateWordPair,
} from "../lib/cloudSync";

type Status = { type: "success" | "error"; text: string } | null;

type SyncState = {
  key: string;
  editingKey: boolean;
  draftKey: string;
  choosingWords: boolean;
  word1: string;
  word2: string;
  wordError: string;
  creatingKey: boolean;
  newlyCreated: boolean;
  copying: boolean;
  pushing: boolean;
  pulling: boolean;
  lastPush: number | null;
  status: Status;
};

type SyncAction =
  | { type: "set_key"; key: string; newlyCreated?: boolean }
  | { type: "start_edit" }
  | { type: "cancel_edit" }
  | { type: "update_draft"; draft: string }
  | { type: "commit_edit"; key: string }
  | { type: "start_choose_words" }
  | { type: "cancel_choose_words" }
  | { type: "update_word1"; word: string }
  | { type: "update_word2"; word: string }
  | { type: "set_word_error"; error: string }
  | { type: "create_start" }
  | { type: "create_done"; key: string }
  | { type: "create_error"; error: string }
  | { type: "dismiss_new" }
  | { type: "copy_start" }
  | { type: "copy_end" }
  | { type: "push_start" }
  | { type: "push_done"; ts: number }
  | { type: "push_error"; error: string }
  | { type: "pull_start" }
  | { type: "pull_done" }
  | { type: "pull_error"; error: string }
  | { type: "set_status"; status: Status };

function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "set_key":
      return { ...state, key: action.key, editingKey: false, choosingWords: false, newlyCreated: action.newlyCreated ?? false, status: null };
    case "start_edit":
      return { ...state, editingKey: true, choosingWords: false, draftKey: state.key };
    case "cancel_edit":
      return { ...state, editingKey: false };
    case "update_draft":
      return { ...state, draftKey: action.draft };
    case "commit_edit":
      return { ...state, key: action.key, editingKey: false };
    case "start_choose_words":
      return { ...state, choosingWords: true, editingKey: false, word1: "", word2: "", wordError: "", creatingKey: false };
    case "cancel_choose_words":
      return { ...state, choosingWords: false, wordError: "" };
    case "update_word1":
      return { ...state, word1: action.word, wordError: "" };
    case "update_word2":
      return { ...state, word2: action.word, wordError: "" };
    case "set_word_error":
      return { ...state, wordError: action.error, creatingKey: false };
    case "create_start":
      return { ...state, creatingKey: true, wordError: "" };
    case "create_done":
      return { ...state, key: action.key, choosingWords: false, creatingKey: false, wordError: "", newlyCreated: true, status: null };
    case "create_error":
      return { ...state, creatingKey: false, wordError: action.error };
    case "dismiss_new":
      return { ...state, newlyCreated: false };
    case "copy_start":
      return { ...state, copying: true };
    case "copy_end":
      return { ...state, copying: false };
    case "push_start":
      return { ...state, pushing: true };
    case "push_done":
      return { ...state, pushing: false, lastPush: action.ts, status: { type: "success", text: "Data pushed to cloud." } };
    case "push_error":
      return { ...state, pushing: false, status: { type: "error", text: action.error } };
    case "pull_start":
      return { ...state, pulling: true };
    case "pull_done":
      return { ...state, pulling: false, status: { type: "success", text: "Data restored. Reloading…" } };
    case "pull_error":
      return { ...state, pulling: false, status: { type: "error", text: action.error } };
    case "set_status":
      return { ...state, status: action.status };
    default:
      return state;
  }
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

export function CloudSyncSection() {
  const [state, dispatch] = useReducer(syncReducer, undefined, () => ({
    key: getSyncKey() ?? "",
    editingKey: false,
    draftKey: "",
    choosingWords: false,
    word1: "",
    word2: "",
    wordError: "",
    creatingKey: false,
    newlyCreated: false,
    copying: false,
    pushing: false,
    pulling: false,
    lastPush: getLastPush(),
    status: null,
  }));
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    key, editingKey, draftKey,
    choosingWords, word1, word2, wordError, creatingKey,
    newlyCreated,
    copying, pushing, pulling, lastPush, status,
  } = state;

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      if (newKeyTimerRef.current) clearTimeout(newKeyTimerRef.current);
    };
  }, []);

  function scheduleStatusClear() {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => dispatch({ type: "set_status", status: null }), 5000);
  }

  function handleGenerate() {
    if (key && !window.confirm("This will replace your current sync key. You will no longer be able to access data pushed under the old key. Continue?")) {
      return;
    }
    dispatch({ type: "set_key", key: generateSyncKey() });
  }

  async function handleCopy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      dispatch({ type: "copy_start" });
      setTimeout(() => dispatch({ type: "copy_end" }), 1500);
    } catch {
      dispatch({ type: "set_status", status: { type: "error", text: "Clipboard access denied — select the key and copy it manually." } });
      scheduleStatusClear();
    }
  }

  function handleSaveEdit() {
    const trimmed = draftKey.trim();
    if (trimmed) {
      setSyncKey(trimmed);
      dispatch({ type: "commit_edit", key: trimmed });
    } else {
      dispatch({ type: "cancel_edit" });
    }
  }

  async function handleCreateWithWords() {
    const words = `${word1.trim().toLowerCase().replace(/[^a-z]/g, "")}-${word2.trim().toLowerCase().replace(/[^a-z]/g, "")}`;
    const validation = validateWordPair(words);
    if (!validation.valid) {
      dispatch({ type: "set_word_error", error: validation.error! });
      return;
    }
    if (key && !window.confirm("This will replace your current sync key. Continue?")) {
      return;
    }
    dispatch({ type: "create_start" });
    try {
      const newKey = await createSyncKeyWithWords(words);
      dispatch({ type: "create_done", key: newKey });
      if (newKeyTimerRef.current) clearTimeout(newKeyTimerRef.current);
      newKeyTimerRef.current = setTimeout(() => dispatch({ type: "dismiss_new" }), 12000);
    } catch (err) {
      dispatch({ type: "create_error", error: err instanceof Error ? err.message : "Failed to create key." });
    }
  }

  async function handlePush() {
    if (!key) {
      dispatch({ type: "set_status", status: { type: "error", text: "Generate or enter a sync key first." } });
      scheduleStatusClear();
      return;
    }
    dispatch({ type: "push_start" });
    try {
      await pushToCloud(key);
      dispatch({ type: "push_done", ts: Date.now() });
      scheduleStatusClear();
    } catch (err) {
      dispatch({ type: "push_error", error: err instanceof Error ? err.message : "Push failed." });
      scheduleStatusClear();
    }
  }

  async function handlePull() {
    if (!key) {
      dispatch({ type: "set_status", status: { type: "error", text: "Enter your sync key first." } });
      scheduleStatusClear();
      return;
    }
    if (!window.confirm("Pull data from cloud? This will replace all your local sessions, stats, and progress. The page will reload.")) {
      return;
    }
    dispatch({ type: "pull_start" });
    try {
      await pullFromCloud(key);
      dispatch({ type: "pull_done" });
      scheduleStatusClear();
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      dispatch({ type: "pull_error", error: err instanceof Error ? err.message : "Pull failed." });
      scheduleStatusClear();
    }
  }

  const busy = pushing || pulling;

  return (
    <section className="mb-8 border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-medium text-gray-500">Cloud Sync (BETA)</h2>
        <p className="text-xs text-gray-400 mt-1">
          Sync your progress across devices using a personal sync key. No account needed.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {/* Key row */}
        <div className="px-4 py-3.5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-gray-700">Sync key</div>
              <div className="text-xs text-gray-400 mt-0.5">
                Write this down — anyone with this key can overwrite your data.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {editingKey ? (
                <>
                  <input
                    type="text"
                    value={draftKey}
                    onChange={(e) => dispatch({ type: "update_draft", draft: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") dispatch({ type: "cancel_edit" }); }}
                    autoFocus
                    placeholder="e.g. amber-forest-4291"
                    className="text-sm font-mono border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500"
                    style={{ width: "13rem" }}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-3 py-1.5 text-sm border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "cancel_edit" })}
                    className="px-3 py-1.5 text-sm border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : key ? (
                <>
                  <code
                    className="text-sm font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 select-all cursor-pointer"
                    onClick={() => dispatch({ type: "start_edit" })}
                    title="Click to edit"
                  >
                    {key}
                  </code>
                  <button
                    type="button"
                    onClick={() => { void handleCopy(); }}
                    className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:border-gray-300 transition-colors"
                    title="Copy key"
                  >
                    {copying ? "Copied!" : "Copy"}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {/* Newly-created banner */}
          {newlyCreated && (
            <div className="mt-2.5 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 flex items-start justify-between gap-2">
              <span>
                Key created — your number was assigned above. Copy it and save it somewhere safe before leaving this page.
              </span>
              <button
                type="button"
                onClick={() => dispatch({ type: "dismiss_new" })}
                className="shrink-0 text-indigo-400 hover:text-indigo-600"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}

          {/* Word-picker form */}
          {choosingWords ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-gray-500">
                Pick any two words (letters only). We'll assign a random number automatically — you'll see the full key once it's ready.
              </div>
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                Choose words that are somewhat personal or unusual. Common combinations like <code className="font-mono">blue-sky</code> are more likely to be guessed, though the random number we add and rate limiting makes any key hard to brute-force regardless.
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  list="sync-word-list-adj"
                  value={word1}
                  onChange={(e) => dispatch({ type: "update_word1", word: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Escape") dispatch({ type: "cancel_choose_words" }); }}
                  autoFocus
                  placeholder="first word"
                  className="text-sm font-mono border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 w-36"
                  spellCheck={false}
                  autoComplete="off"
                />
                <datalist id="sync-word-list-adj">
                  {ADJECTIVES.map((w) => <option key={w} value={w} />)}
                </datalist>
                <span className="text-gray-400 text-sm select-none">–</span>
                <input
                  type="text"
                  list="sync-word-list-noun"
                  value={word2}
                  onChange={(e) => dispatch({ type: "update_word2", word: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { void handleCreateWithWords(); }
                    if (e.key === "Escape") dispatch({ type: "cancel_choose_words" });
                  }}
                  placeholder="second word"
                  className="text-sm font-mono border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 w-36"
                  spellCheck={false}
                  autoComplete="off"
                />
                <datalist id="sync-word-list-noun">
                  {NOUNS.map((w) => <option key={w} value={w} />)}
                </datalist>
                <button
                  type="button"
                  onClick={() => { void handleCreateWithWords(); }}
                  disabled={creatingKey || !word1 || !word2}
                  className="px-3 py-1.5 text-sm border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creatingKey ? "Creating…" : "Create key"}
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "cancel_choose_words" })}
                  disabled={creatingKey}
                  className="px-3 py-1.5 text-sm border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {wordError && (
                <div className="text-xs text-red-600">{wordError}</div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-2.5">
              <button
                type="button"
                onClick={handleGenerate}
                className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {key ? "Generate new key" : "Generate a sync key"}
              </button>
              <span className="text-xs text-gray-300">or</span>
              <button
                type="button"
                onClick={() => dispatch({ type: "start_choose_words" })}
                className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Choose your words
              </button>
              {!key && (
                <>
                  <span className="text-xs text-gray-300">or</span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "start_edit" })}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Enter existing key
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Push / Pull row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div>
            <div className="text-sm text-gray-700">Sync data</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {lastPush ? `Last pushed ${formatRelativeTime(lastPush)}` : "Never pushed"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void handlePush(); }}
              disabled={busy || !key}
              className="px-3 py-1.5 text-sm border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pushing ? "Pushing…" : "Push"}
            </button>
            <button
              type="button"
              onClick={() => { void handlePull(); }}
              disabled={busy || !key}
              className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pulling ? "Pulling…" : "Pull"}
            </button>
          </div>
        </div>

        {/* Status row */}
        {status && (
          <div className="px-4 py-3">
            <div
              className={`px-3 py-2 rounded-lg text-sm ${
                status.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {status.text}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
