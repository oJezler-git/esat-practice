import { useEffect, useReducer, useRef, useState } from "react";

type VirtualState = {
  scrollTop: number;
  viewportHeight: number;
  virtualCount: number;
};

type VirtualAction =
  | { type: "sync_metrics"; scrollTop: number; viewportHeight: number }
  | { type: "set_count"; count: number };

function virtualReducer(state: VirtualState, action: VirtualAction): VirtualState {
  switch (action.type) {
    case "sync_metrics":
      return { ...state, scrollTop: action.scrollTop, viewportHeight: action.viewportHeight };
    case "set_count":
      return { ...state, virtualCount: action.count };
    default:
      return state;
  }
}

// Each virtual slot is a fixed card plus a uniform gap. Keep these in sync with
// the fixed `height` of `.sk-history .hist-card` and the `.hist-list` gap in the
// history stylesheets — the mobile row keeps the same 3-column layout, so it only
// needs a little extra height for the meta line wrapping.
const CARD_HEIGHT = 92;
const MOBILE_CARD_HEIGHT = 112;
const ROW_GAP = 10;
const NARROW_MEDIA_QUERY = "(max-width: 768px)";
const VIRTUAL_OVERSCAN = 6;
const VIRTUAL_BATCH_SIZE = 40;

/**
 * Windowed rendering of the (already-filtered) session list. Mirrors the
 * window-scroll virtualization used by the question bank: it tracks the list's
 * offset from the top of the document, only renders the visible slice, and grows
 * the rendered batch as the user scrolls.
 */
export function useVirtualSessionList(count: number) {
  const [virtualState, dispatchVirtual] = useReducer(virtualReducer, {
    scrollTop: 0,
    viewportHeight: 0,
    virtualCount: VIRTUAL_BATCH_SIZE,
  });
  const { scrollTop, viewportHeight, virtualCount } = virtualState;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(NARROW_MEDIA_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MEDIA_QUERY);
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const cardHeight = isNarrow ? MOBILE_CARD_HEIGHT : CARD_HEIGHT;
  const rowHeight = cardHeight + ROW_GAP;

  useEffect(() => {
    const syncWindowMetrics = () => {
      const listTop = listRef.current?.getBoundingClientRect().top ?? 0;
      const absoluteTop = window.scrollY + listTop;
      dispatchVirtual({
        type: "sync_metrics",
        scrollTop: Math.max(0, window.scrollY - absoluteTop),
        viewportHeight: window.innerHeight,
      });
    };

    syncWindowMetrics();
    window.addEventListener("scroll", syncWindowMetrics, { passive: true });
    window.addEventListener("resize", syncWindowMetrics);

    return () => {
      window.removeEventListener("scroll", syncWindowMetrics);
      window.removeEventListener("resize", syncWindowMetrics);
    };
  }, []);

  // Reset the window whenever the filtered length changes (e.g. selecting a
  // different heatmap day narrows the list).
  useEffect(() => {
    dispatchVirtual({ type: "set_count", count: Math.min(count, VIRTUAL_BATCH_SIZE) });
  }, [count]);

  useEffect(() => {
    const neededCount =
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + VIRTUAL_OVERSCAN * 2;
    if (neededCount > virtualCount && virtualCount < count) {
      dispatchVirtual({
        type: "set_count",
        count: Math.min(count, Math.max(virtualCount + VIRTUAL_BATCH_SIZE, neededCount)),
      });
    }
  }, [count, scrollTop, viewportHeight, virtualCount, rowHeight]);

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN,
  );
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + VIRTUAL_OVERSCAN * 2;
  const endIndex = Math.min(virtualCount, count, startIndex + visibleCount);
  const totalHeight = Math.min(virtualCount, count) * rowHeight;

  return {
    listRef,
    rowHeight,
    startIndex,
    endIndex,
    totalHeight,
  };
}
