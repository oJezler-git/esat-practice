import type { SyncStatus } from "./useCloudSync";

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

interface SyncDataPanelProps {
  hasKey: boolean;
  busy: boolean;
  pushing: boolean;
  pulling: boolean;
  restoring: boolean;
  lastPush: number | null;
  lastPull: number | null;
  showUndo: boolean;
  status: SyncStatus;
  onPush: () => void;
  onPull: () => void;
  onRestore: () => void;
}

export function SyncDataPanel({
  hasKey,
  busy,
  pushing,
  pulling,
  restoring,
  lastPush,
  lastPull,
  showUndo,
  status,
  onPush,
  onPull,
  onRestore,
}: SyncDataPanelProps) {
  return (
    <>
      {/* Push / Pull row */}
      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
        <div>
          <div className="text-sm text-secondary">Sync data</div>
          <div className="text-xs text-muted mt-0.5">
            {lastPush ? `Last pushed ${formatRelativeTime(lastPush)}` : "Never pushed"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPush}
            disabled={busy || !hasKey}
            className="px-3 py-1.5 text-sm border border-accent text-accent-strong rounded-lg hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pushing ? "Pushing…" : "Push"}
          </button>
          <button
            type="button"
            onClick={onPull}
            disabled={busy || !hasKey}
            className="px-3 py-1.5 text-sm border border-subtle text-secondary rounded-lg hover:border-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pulling ? "Pulling…" : "Pull"}
          </button>
        </div>
      </div>

      {/* Undo last pull row */}
      {showUndo && (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="text-xs text-muted">
            Pulled {formatRelativeTime(lastPull!)} — you can undo this within 24 hours.
          </div>
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="px-3 py-1.5 text-xs border border-subtle text-muted rounded-lg hover:border-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {restoring ? "Restoring…" : "Undo last pull"}
          </button>
        </div>
      )}

      {/* Status row */}
      {status && (
        <div className="px-4 py-3">
          <div
            className={`px-3 py-2 rounded-lg text-sm ${
              status.type === "success"
                ? "bg-success-soft text-success-text border border-success"
                : "bg-danger-soft text-danger-text border border-danger"
            }`}
          >
            {status.text}
          </div>
        </div>
      )}
    </>
  );
}
