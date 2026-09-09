import { useEffect, useReducer, useRef } from "react";
import { getSyncKey, validateWordPair } from "../../lib/cloudSync";
import {
  connectSyncKey,
  createRandomSyncKey,
  createSyncKeyWithWords,
  disconnectSync,
  syncNow,
  useSyncStatus,
} from "../../lib/syncCoordinator";

type SyncState = {
  key: string; editingKey: boolean; draftKey: string; choosingWords: boolean;
  word1: string; word2: string; wordError: string; creatingKey: boolean;
  newlyCreated: boolean; copying: boolean; actionError: string | null;
};

type SyncAction =
  | { type: "set_key"; key: string }
  | { type: "start_edit" } | { type: "cancel_edit" }
  | { type: "update_draft"; draft: string }
  | { type: "start_choose_words" } | { type: "cancel_choose_words" }
  | { type: "update_word1"; word: string } | { type: "update_word2"; word: string }
  | { type: "set_word_error"; error: string } | { type: "create_start" }
  | { type: "create_done"; key: string } | { type: "action_error"; error: string }
  | { type: "clear_action_error" }
  | { type: "dismiss_new" } | { type: "copy_start" } | { type: "copy_end" }
  | { type: "disconnected" };

function reducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "set_key": return { ...state, key: action.key, editingKey: false, choosingWords: false, creatingKey: false, actionError: null };
    case "start_edit": return { ...state, editingKey: true, choosingWords: false, draftKey: state.key, actionError: null };
    case "cancel_edit": return { ...state, editingKey: false };
    case "update_draft": return { ...state, draftKey: action.draft };
    case "start_choose_words": return { ...state, choosingWords: true, editingKey: false, word1: "", word2: "", wordError: "", actionError: null };
    case "cancel_choose_words": return { ...state, choosingWords: false, wordError: "" };
    case "update_word1": return { ...state, word1: action.word, wordError: "" };
    case "update_word2": return { ...state, word2: action.word, wordError: "" };
    case "set_word_error": return { ...state, wordError: action.error, creatingKey: false };
    case "create_start": return { ...state, creatingKey: true, wordError: "", actionError: null };
    case "create_done": return { ...state, key: action.key, choosingWords: false, editingKey: false, creatingKey: false, newlyCreated: true, wordError: "", actionError: null };
    case "action_error": return { ...state, creatingKey: false, actionError: action.error };
    case "clear_action_error": return { ...state, actionError: null };
    case "dismiss_new": return { ...state, newlyCreated: false };
    case "copy_start": return { ...state, copying: true };
    case "copy_end": return { ...state, copying: false };
    case "disconnected": return { ...state, key: "", editingKey: false, choosingWords: false, newlyCreated: false, actionError: null };
  }
}

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function useCloudSync() {
  const coordinatorStatus = useSyncStatus();
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    key: getSyncKey() ?? "", editingKey: false, draftKey: "", choosingWords: false,
    word1: "", word2: "", wordError: "", creatingKey: false, newlyCreated: false,
    copying: false, actionError: null,
  }));
  const newKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (newKeyTimerRef.current) clearTimeout(newKeyTimerRef.current);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const confirmReplacement = () => !state.key || window.confirm("This will disconnect this device from its current sync key and connect it to the new one. Continue?");
  const showNewKey = (key: string) => {
    dispatch({ type: "create_done", key });
    if (newKeyTimerRef.current) clearTimeout(newKeyTimerRef.current);
    newKeyTimerRef.current = setTimeout(() => dispatch({ type: "dismiss_new" }), 12_000);
  };

  async function onGenerate() {
    if (!confirmReplacement()) return;
    dispatch({ type: "create_start" });
    try { showNewKey(await createRandomSyncKey()); }
    catch (error) { dispatch({ type: "action_error", error: message(error, "Failed to create key.") }); }
  }

  async function onSaveEdit() {
    const key = state.draftKey.trim();
    if (!key) { dispatch({ type: "cancel_edit" }); return; }
    if (state.key && key !== state.key && !confirmReplacement()) return;
    dispatch({ type: "create_start" });
    try { await connectSyncKey(key); dispatch({ type: "set_key", key }); }
    catch (error) { dispatch({ type: "action_error", error: message(error, "Could not connect this key.") }); }
  }

  async function onCreateWithWords() {
    const words = `${state.word1.trim().toLowerCase().replace(/[^a-z]/g, "")}-${state.word2.trim().toLowerCase().replace(/[^a-z]/g, "")}`;
    const validation = validateWordPair(words);
    if (!validation.valid) { dispatch({ type: "set_word_error", error: validation.error! }); return; }
    if (!confirmReplacement()) return;
    dispatch({ type: "create_start" });
    try { showNewKey(await createSyncKeyWithWords(words)); }
    catch (error) { dispatch({ type: "set_word_error", error: message(error, "Failed to create key.") }); }
  }

  async function onCopy() {
    if (!state.key) return;
    try {
      await navigator.clipboard.writeText(state.key);
      dispatch({ type: "copy_start" });
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => dispatch({ type: "copy_end" }), 1_500);
    } catch { dispatch({ type: "action_error", error: "Clipboard access denied — select the key and copy it manually." }); }
  }

  async function onDisconnect() {
    if (!window.confirm("Disconnect automatic sync on this device? Your local practice data will stay here.")) return;
    try {
      await disconnectSync();
      dispatch({ type: "disconnected" });
    } catch (error) {
      dispatch({ type: "action_error", error: message(error, "Could not disconnect sync.") });
    }
  }

  async function onRetry() {
    dispatch({ type: "clear_action_error" });
    await syncNow("manual");
  }

  const syncStatus = state.actionError
    ? { status: "error" as const, lastSyncedAt: coordinatorStatus.lastSyncedAt, error: state.actionError }
    : coordinatorStatus;

  return {
    state, syncStatus,
    onStartEdit: () => dispatch({ type: "start_edit" }),
    onCancelEdit: () => dispatch({ type: "cancel_edit" }),
    onDraftChange: (draft: string) => dispatch({ type: "update_draft", draft }),
    onSaveEdit,
    onStartChooseWords: () => dispatch({ type: "start_choose_words" }),
    onCancelChooseWords: () => dispatch({ type: "cancel_choose_words" }),
    onWord1Change: (word: string) => dispatch({ type: "update_word1", word }),
    onWord2Change: (word: string) => dispatch({ type: "update_word2", word }),
    onCreateWithWords, onGenerate, onCopy, onDisconnect,
    onDismissNew: () => dispatch({ type: "dismiss_new" }),
    onRetry,
  };
}
