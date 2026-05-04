/**
 * Global loading progress tracker
 * Allows the loader to emit progress updates that the UI can subscribe to
 */

export interface LoadingProgressState {
  isLoading: boolean;
  stage: "idle" | "manifest" | "packs" | "complete";
  currentPack: string | null;
  packIndex: number;
  totalPacks: number;
  percentComplete: number;
  bytesLoaded: number;
  totalBytes: number;
  message: string;
}

type ProgressListener = (state: LoadingProgressState) => void;

let currentState: LoadingProgressState = {
  isLoading: false,
  stage: "idle",
  currentPack: null,
  packIndex: 0,
  totalPacks: 0,
  percentComplete: 0,
  bytesLoaded: 0,
  totalBytes: 0,
  message: "Ready",
};

const listeners = new Set<ProgressListener>();

function updateState(partial: Partial<LoadingProgressState>) {
  currentState = { ...currentState, ...partial };
  listeners.forEach((listener) => listener(currentState));
}

export function getLoadingProgress(): LoadingProgressState {
  return currentState;
}

export function subscribeToLoadingProgress(listener: ProgressListener): () => void {
  listeners.add(listener);
  // Immediately call with current state
  listener(currentState);
  // Return unsubscribe function
  return () => {
    listeners.delete(listener);
  };
}

export function setLoadingStage(stage: LoadingProgressState["stage"], message?: string) {
  updateState({
    stage,
    message: message || currentState.message,
  });
}

export function startPackLoading(packId: string, packIndex: number, totalPacks: number, totalBytes: number) {
  updateState({
    isLoading: true,
    stage: "packs",
    currentPack: packId,
    packIndex,
    totalPacks,
    totalBytes,
    message: `Loading ${packId} (${packIndex + 1} of ${totalPacks})...`,
  });
}

export function completePackLoading(packId: string, bytesLoaded: number) {
  const percentComplete = Math.round((bytesLoaded / currentState.totalBytes) * 100);
  updateState({
    currentPack: packId,
    bytesLoaded,
    percentComplete,
    message: `Loaded ${packId} • ${formatBytes(bytesLoaded)} / ${formatBytes(currentState.totalBytes)}`,
  });
}

export function completeAllLoading() {
  updateState({
    isLoading: false,
    stage: "complete",
    percentComplete: 100,
    currentPack: null,
    message: "Question bank ready",
  });
}

export function resetLoadingProgress() {
  updateState({
    isLoading: false,
    stage: "idle",
    currentPack: null,
    packIndex: 0,
    totalPacks: 0,
    percentComplete: 0,
    bytesLoaded: 0,
    totalBytes: 0,
    message: "Ready",
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + " " + sizes[i];
}
