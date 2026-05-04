import { useEffect, useState } from "react";
import type { LoadingProgressState } from "../lib/loadingProgress";
import { subscribeToLoadingProgress } from "../lib/loadingProgress";

export function useLoadingProgress() {
  const [progress, setProgress] = useState<LoadingProgressState>({
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

  useEffect(() => {
    const unsubscribe = subscribeToLoadingProgress(setProgress);
    return () => {
      unsubscribe();
    };
  }, []);

  return progress;
}
