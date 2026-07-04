import { useEffect, useReducer, useRef } from "react";
import {
  createSyncKeyWithWords,
  generateSyncKey,
  getLastPull,
  getLastPush,
  getSyncKey,
  hasLocalBackup,
  pullFromCloud,
  pushToCloud,
  restoreLastBackup,
  setSyncKey,
  validateWordPair,
} from "../../lib/cloudSync";

export type SyncStatus = { type: "success" | "error"; text: string } | null;

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
  restoring: boolean;
  lastPush: number | null;
  lastPull: number | null;
  hasBackup: boolean;
  status: SyncStatus;
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
  | { type: "pull_done"; ts: number }
  | { type: "pull_error"; error: string }
  | { type: "restore_start" }
  | { type: "restore_done" }
  | { type: "restore_error"; error: string }
  | { type: "set_backup_state"; hasBackup: boolean }
  | { type: "set_status"; status: SyncStatus };

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
      return { ...state, pulling: false, lastPull: action.ts, hasBackup: true, status: { type: "success", text: "Cloud data merged. Reloading…" } };
    case "pull_error":
      return { ...state, pulling: false, status: { type: "error", text: action.error } };
    case "restore_start":
      return { ...state, restoring: true };
    case "restore_done":
      return { ...state, restoring: false, lastPull: null, hasBackup: false, status: { type: "success", text: "Restored. Reloading…" } };
    case "restore_error":
      return { ...state, restoring: false, status: { type: "error", text: action.error } };
    case "set_backup_state":
      return { ...state, hasBackup: action.hasBackup };
    case "set_status":
      return { ...state, status: action.status };
    default:
      return state;
  }
}

const UNDO_WINDOW_MS = 86_400_000; // 24 hours

export function useCloudSync() {
  const lastPullInit = getLastPull();
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
    restoring: false,
    lastPush: getLastPush(),
    lastPull: lastPullInit,
    hasBackup: false,
    status: null,
  }));
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void hasLocalBackup().then((has) => dispatch({ type: "set_backup_state", hasBackup: has }));
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      if (newKeyTimerRef.current) clearTimeout(newKeyTimerRef.current);
    };
  }, []);

  function scheduleStatusClear() {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => dispatch({ type: "set_status", status: null }), 5000);
  }

  function onGenerate() {
    if (state.key && !window.confirm("This will replace your current sync key. You will no longer be able to access data pushed under the old key. Continue?")) {
      return;
    }
    dispatch({ type: "set_key", key: generateSyncKey() });
  }

  async function onCopy() {
    if (!state.key) return;
    try {
      await navigator.clipboard.writeText(state.key);
      dispatch({ type: "copy_start" });
      setTimeout(() => dispatch({ type: "copy_end" }), 1500);
    } catch {
      dispatch({ type: "set_status", status: { type: "error", text: "Clipboard access denied — select the key and copy it manually." } });
      scheduleStatusClear();
    }
  }

  function onSaveEdit() {
    const trimmed = state.draftKey.trim();
    if (trimmed) {
      setSyncKey(trimmed);
      dispatch({ type: "commit_edit", key: trimmed });
    } else {
      dispatch({ type: "cancel_edit" });
    }
  }

  async function onCreateWithWords() {
    const words = `${state.word1.trim().toLowerCase().replace(/[^a-z]/g, "")}-${state.word2.trim().toLowerCase().replace(/[^a-z]/g, "")}`;
    const validation = validateWordPair(words);
    if (!validation.valid) {
      dispatch({ type: "set_word_error", error: validation.error! });
      return;
    }
    if (state.key && !window.confirm("This will replace your current sync key. Continue?")) {
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

  async function onPush() {
    if (!state.key) {
      dispatch({ type: "set_status", status: { type: "error", text: "Generate or enter a sync key first." } });
      scheduleStatusClear();
      return;
    }
    dispatch({ type: "push_start" });
    try {
      await pushToCloud(state.key);
      dispatch({ type: "push_done", ts: Date.now() });
      scheduleStatusClear();
    } catch (err) {
      dispatch({ type: "push_error", error: err instanceof Error ? err.message : "Push failed." });
      scheduleStatusClear();
    }
  }

  async function onPull() {
    if (!state.key) {
      dispatch({ type: "set_status", status: { type: "error", text: "Enter your sync key first." } });
      scheduleStatusClear();
      return;
    }
    if (!window.confirm("Pull data from cloud? Cloud sessions and attempts not on this device will be added. Your existing local data will be kept. The page will reload.")) {
      return;
    }
    dispatch({ type: "pull_start" });
    try {
      await pullFromCloud(state.key);
      const ts = Date.now();
      dispatch({ type: "pull_done", ts });
      scheduleStatusClear();
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      dispatch({ type: "pull_error", error: err instanceof Error ? err.message : "Pull failed." });
      scheduleStatusClear();
    }
  }

  async function onRestore() {
    if (!window.confirm("Restore your data to exactly before the last pull? Any sessions or attempts added since then will be lost.")) {
      return;
    }
    dispatch({ type: "restore_start" });
    try {
      await restoreLastBackup();
      dispatch({ type: "restore_done" });
      scheduleStatusClear();
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      dispatch({ type: "restore_error", error: err instanceof Error ? err.message : "Restore failed." });
      scheduleStatusClear();
    }
  }

  const busy = state.pushing || state.pulling || state.restoring;
  const showUndo = state.hasBackup && state.lastPull !== null && (Date.now() - state.lastPull < UNDO_WINDOW_MS);

  return {
    state,
    busy,
    showUndo,
    onStartEdit: () => dispatch({ type: "start_edit" }),
    onCancelEdit: () => dispatch({ type: "cancel_edit" }),
    onDraftChange: (draft: string) => dispatch({ type: "update_draft", draft }),
    onSaveEdit,
    onStartChooseWords: () => dispatch({ type: "start_choose_words" }),
    onCancelChooseWords: () => dispatch({ type: "cancel_choose_words" }),
    onWord1Change: (word: string) => dispatch({ type: "update_word1", word }),
    onWord2Change: (word: string) => dispatch({ type: "update_word2", word }),
    onCreateWithWords,
    onGenerate,
    onCopy,
    onDismissNew: () => dispatch({ type: "dismiss_new" }),
    onPush,
    onPull,
    onRestore,
  };
}
