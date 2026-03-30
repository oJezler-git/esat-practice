export interface SessionTicker {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createSessionTicker(
  onTick: (elapsedMs: number) => void,
  intervalMs: number = 250,
): SessionTicker {
  let timerId: number | null = null;
  let lastTick = Date.now();

  const handleVisibilityChange = () => {
    lastTick = Date.now();
  };

  const runTick = () => {
    if (typeof document !== "undefined" && document.hidden) {
      lastTick = Date.now();
      return;
    }
    const now = Date.now();
    const elapsed = now - lastTick;
    lastTick = now;
    onTick(elapsed);
  };

  const start = () => {
    if (timerId !== null || typeof window === "undefined") {
      return;
    }
    lastTick = Date.now();
    timerId = window.setInterval(runTick, intervalMs);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
  };

  const stop = () => {
    if (timerId !== null && typeof window !== "undefined") {
      window.clearInterval(timerId);
      timerId = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };

  return {
    start,
    stop,
    isRunning: () => timerId !== null,
  };
}
