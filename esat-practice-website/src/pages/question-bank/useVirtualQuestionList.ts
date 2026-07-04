import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Question } from "../../types/schema";

type VirtualState = {
  scrollTop: number;
  viewportHeight: number;
  virtualCount: number;
  detailHeight: number;
};

type VirtualAction =
  | { type: "sync_metrics"; scrollTop: number; viewportHeight: number }
  | { type: "set_count"; count: number }
  | { type: "set_detail_height"; height: number };

function virtualReducer(state: VirtualState, action: VirtualAction): VirtualState {
  switch (action.type) {
    case "sync_metrics": return { ...state, scrollTop: action.scrollTop, viewportHeight: action.viewportHeight };
    case "set_count": return { ...state, virtualCount: action.count };
    case "set_detail_height":
      return action.height === state.detailHeight
        ? state
        : { ...state, detailHeight: action.height };
    default: return state;
  }
}

// Each virtual slot is a fixed card plus a uniform gap. Keep these in sync with
// the `height` of `.question-bank-row-button` in question-bank.css — the desktop
// row is a single line, the mobile row stacks into three, so it needs more room.
const VIRTUAL_CARD_HEIGHT = 90;
const VIRTUAL_ROW_GAP = 14;
const MOBILE_CARD_HEIGHT = 152;
const MOBILE_ROW_GAP = 12;
const NARROW_MEDIA_QUERY = "(max-width: 768px)";
const VIRTUAL_OVERSCAN = 8;
const VIRTUAL_BATCH_SIZE = 80;

/**
 * Windowed rendering of the (already-filtered) question list: tracks scroll
 * position, grows the rendered batch as the user scrolls, and accounts for
 * the expanded detail panel pushing rows below it further down.
 */
export function useVirtualQuestionList(filtered: Question[]) {
  const [virtualState, dispatchVirtual] = useReducer(virtualReducer, {
    scrollTop: 0,
    viewportHeight: 0,
    virtualCount: VIRTUAL_BATCH_SIZE,
    detailHeight: 0,
  });
  const { scrollTop, viewportHeight, virtualCount, detailHeight } = virtualState;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(NARROW_MEDIA_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MEDIA_QUERY);
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const cardHeight = isNarrow ? MOBILE_CARD_HEIGHT : VIRTUAL_CARD_HEIGHT;
  const rowGap = isNarrow ? MOBILE_ROW_GAP : VIRTUAL_ROW_GAP;
  const rowHeight = cardHeight + rowGap;
  // Rows reposition on every scroll, so we only allow the `top` transition during
  // a short window around open/close — otherwise scrolling would animate too.
  const [isAnimating, setIsAnimating] = useState(false);
  const animTimeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(animTimeoutRef.current), []);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const setExpanded = useCallback((id: string | null) => {
    setIsAnimating(true);
    window.clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = window.setTimeout(() => setIsAnimating(false), 260);
    setExpandedId(id);
  }, []);
  // Stable so the panel's ResizeObserver effect doesn't re-subscribe every render.
  const handleDetailHeightChange = useCallback(
    (height: number) => dispatchVirtual({ type: "set_detail_height", height }),
    [],
  );

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

  useEffect(() => {
    dispatchVirtual({ type: "set_count", count: Math.min(filtered.length, VIRTUAL_BATCH_SIZE) });
    // `filtered` is a new array reference whenever any filter criterion (search,
    // scope, topic, year, verified, sort, dedup) changes, so it alone captures
    // every case that should reset the virtualization window.
  }, [filtered]);

  useEffect(() => {
    const neededCount =
      Math.ceil((scrollTop + viewportHeight) / rowHeight) +
      VIRTUAL_OVERSCAN * 2;
    if (neededCount > virtualCount && virtualCount < filtered.length) {
      dispatchVirtual({ type: "set_count", count: Math.min(filtered.length, Math.max(virtualCount + VIRTUAL_BATCH_SIZE, neededCount)) });
    }
  }, [filtered.length, scrollTop, viewportHeight, virtualCount, rowHeight]);

  const selectedQuestion = useMemo(
    () => filtered.find((question) => question.id === expandedId) ?? null,
    [expandedId, filtered],
  );
  const selectedIndex = useMemo(
    () => filtered.findIndex((question) => question.id === expandedId),
    [expandedId, filtered],
  );
  const detailBlockHeight =
    selectedQuestion && selectedIndex >= 0 ? detailHeight + rowGap : 0;
  const dynamicTotalHeight =
    Math.min(virtualCount, filtered.length) * rowHeight +
    detailBlockHeight;
  // Rows below an open detail panel are pushed down by detailBlockHeight, so the
  // windowing math has to unwind that offset once we've scrolled past the panel —
  // otherwise the visible-row window drifts and rows near the fold stop rendering.
  const selectionThreshold = (selectedIndex + 1) * rowHeight;
  const effectiveScrollTop =
    detailBlockHeight > 0 && scrollTop > selectionThreshold
      ? Math.max(selectionThreshold, scrollTop - detailBlockHeight)
      : scrollTop;
  const startIndex = Math.max(
    0,
    Math.floor(effectiveScrollTop / rowHeight) - VIRTUAL_OVERSCAN,
  );
  const visibleCount =
    Math.ceil(viewportHeight / rowHeight) + VIRTUAL_OVERSCAN * 2;
  const endIndex = Math.min(virtualCount, startIndex + visibleCount);
  const virtualSlice = filtered.slice(startIndex, endIndex);

  return {
    listRef,
    cardHeight,
    rowGap,
    rowHeight,
    isAnimating,
    expandedId,
    setExpanded,
    handleDetailHeightChange,
    selectedQuestion,
    selectedIndex,
    detailBlockHeight,
    dynamicTotalHeight,
    startIndex,
    endIndex,
    virtualSlice,
  };
}
