import { useEffect, useRef, useState } from "react";
import {
  generateSyncKey,
  getLastPush,
  getSyncKey,
  pullFromCloud,
  pushToCloud,
  setSyncKey,
} from "../lib/cloudSync";

type Status = { type: "success" | "error"; text: string } | null;

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
  const [key, setKey] = useState<string>(() => getSyncKey() ?? "");
  const [editingKey, setEditingKey] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [copying, setCopying] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [lastPush, setLastPush] = useState<number | null>(() => getLastPush());
  const [status, setStatus] = useState<Status>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  function showStatus(s: Status) {
    setStatus(s);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    if (s) {
      statusTimerRef.current = setTimeout(() => setStatus(null), 5000);
    }
  }

  function handleGenerate() {
    if (key && !window.confirm("This will replace your current sync key. You will no longer be able to access data pushed under the old key. Continue?")) {
      return;
    }
    const newKey = generateSyncKey();
    setKey(newKey);
    setEditingKey(false);
    showStatus(null);
  }

  async function handleCopy() {
    if (!key) return;
    await navigator.clipboard.writeText(key);
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
  }

  function handleStartEdit() {
    setDraftKey(key);
    setEditingKey(true);
  }

  function handleSaveEdit() {
    const trimmed = draftKey.trim();
    if (trimmed) {
      setSyncKey(trimmed);
      setKey(trimmed);
    }
    setEditingKey(false);
  }

  async function handlePush() {
    if (!key) {
      showStatus({ type: "error", text: "Generate or enter a sync key first." });
      return;
    }
    setPushing(true);
    try {
      await pushToCloud(key);
      const ts = Date.now();
      setLastPush(ts);
      showStatus({ type: "success", text: "Data pushed to cloud." });
    } catch (err) {
      showStatus({ type: "error", text: err instanceof Error ? err.message : "Push failed." });
    } finally {
      setPushing(false);
    }
  }

  async function handlePull() {
    if (!key) {
      showStatus({ type: "error", text: "Enter your sync key first." });
      return;
    }
    if (!window.confirm("Pull data from cloud? This will replace all your local sessions, stats, and progress. The page will reload.")) {
      return;
    }
    setPulling(true);
    try {
      await pullFromCloud(key);
      showStatus({ type: "success", text: "Data restored. Reloading…" });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      showStatus({ type: "error", text: err instanceof Error ? err.message : "Pull failed." });
      setPulling(false);
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
                    onChange={(e) => setDraftKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingKey(false); }}
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
                    onClick={() => setEditingKey(false)}
                    className="px-3 py-1.5 text-sm border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : key ? (
                <>
                  <code
                    className="text-sm font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 select-all cursor-pointer"
                    onClick={handleStartEdit}
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
          <div className="flex items-center gap-3 mt-2.5">
            <button
              type="button"
              onClick={handleGenerate}
              className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {key ? "Generate new key" : "Generate a sync key"}
            </button>
            {!key && (
              <>
                <span className="text-xs text-gray-300">or</span>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Enter existing key
                </button>
              </>
            )}
          </div>
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
