import { useEffect, useRef, type RefObject } from "react";
import { useRevisionProgress } from "../../store/revisionProgress";

/**
 * Computes how far the given article has been revealed in the window and feeds
 * the running-max into the revision progress store.
 *
 * The revision page scrolls the window (the sidebar/TOC are position: sticky),
 * so progress is measured from the article's position in the document rather
 * than a scroll container. Reads are rAF-throttled (one measurement per frame)
 * and store writes are debounced, with a final flush on unmount so a quick skim
 * still records.
 */
export function useScrollProgress(
  articleRef: RefObject<HTMLElement | null>,
  docId: string | undefined,
  enabled: boolean,
  debounceMs = 400,
): void {
  const recordScroll = useRevisionProgress((state) => state.recordScroll);
  const latestRef = useRef<number>(0);
  const flushTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !docId) {
      return;
    }

    const el = articleRef.current;
    if (!el) {
      return;
    }

    const compute = (): number => {
      const rect = el.getBoundingClientRect();
      const articleTop = rect.top + window.scrollY;
      const articleHeight = el.scrollHeight;
      if (articleHeight <= 0) {
        return 100;
      }
      const revealed = window.scrollY + window.innerHeight - articleTop;
      return Math.min(100, Math.max(0, (revealed / articleHeight) * 100));
    };

    const flush = () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      recordScroll(docId, latestRef.current);
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(flush, debounceMs);
    };

    const onScroll = () => {
      if (rafRef.current !== null) {
        return;
      }
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        latestRef.current = compute();
        scheduleFlush();
      });
    };

    // Seed an initial measurement so short (fully-visible) guides record their
    // completion without waiting for a scroll event that may never come.
    latestRef.current = compute();
    scheduleFlush();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Persist the last known depth even if the debounce hadn't fired yet.
      flush();
    };
  }, [articleRef, docId, enabled, debounceMs, recordScroll]);
}
