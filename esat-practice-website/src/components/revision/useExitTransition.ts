import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Keeps the previous non-null value on screen (so the caller can render an
 * exit animation on it) instead of snapping straight to null the instant
 * `resetKey` changes. Once the exit window elapses the display value clears,
 * and the next non-null value to arrive is shown immediately, with its own
 * entrance animation driven by the caller's own key on that content.
 */
export function useExitTransition<T>(value: T | null, resetKey: unknown, exitMs: number) {
  const [display, setDisplay] = useState<T | null>(value);
  const [exiting, setExiting] = useState(false);
  const lastKeyRef = useRef(resetKey);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    if (resetKey === lastKeyRef.current) {
      return;
    }
    lastKeyRef.current = resetKey;

    // Nothing on screen to animate out (e.g. the very first topic load) —
    // clear immediately and let the entrance animation handle the reveal.
    if (displayRef.current === null) {
      setDisplay(null);
      setExiting(false);
      return;
    }

    setExiting(true);
    const duration = prefersReducedMotion() ? 0 : exitMs;
    const timer = window.setTimeout(() => {
      setDisplay(null);
      setExiting(false);
    }, duration);
    return () => window.clearTimeout(timer);
    // exitMs is a constant per call site; only resetKey should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!exiting && value !== null && display === null) {
      setDisplay(value);
    }
  }, [value, exiting, display]);

  return { display, exiting };
}
