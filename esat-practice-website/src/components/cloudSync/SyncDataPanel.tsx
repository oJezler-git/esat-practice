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
  phase: "disconnected" | "syncing" | "saved" | "offline" | "error";
  lastSyncedAt: number | null;
  error: string | null;
  onRetry: () => void;
}

export function SyncDataPanel({
  hasKey,
  phase,
  lastSyncedAt,
  error,
  onRetry,
}: SyncDataPanelProps) {
  const status = !hasKey || phase === "disconnected"
    ? { label: "Not connected", detail: "Connect once and your practice progress will save automatically." }
    : phase === "syncing"
      ? { label: "Syncing…", detail: "Saving your latest practice changes." }
      : phase === "offline"
        ? { label: "Offline — changes will sync automatically", detail: "You can keep practising while disconnected." }
        : phase === "error"
          ? { label: "Sync needs attention", detail: error ?? "Automatic sync could not finish." }
          : {
              label: lastSyncedAt ? `Saved ${formatRelativeTime(lastSyncedAt)}` : "Automatic sync is on",
              detail: "Changes save automatically across connected devices.",
            };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5" aria-live="polite">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm text-secondary">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${
              phase === "error"
                ? "bg-danger-text"
                : phase === "offline"
                  ? "bg-amber"
                  : hasKey
                    ? "bg-success-text"
                    : "bg-muted"
            }`}
          />
          {status.label}
        </div>
        <div className="text-xs text-muted mt-0.5">{status.detail}</div>
      </div>
      {hasKey && phase === "error" && (
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 text-sm border border-accent text-accent-strong rounded-lg hover:bg-accent-soft transition-colors shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}
