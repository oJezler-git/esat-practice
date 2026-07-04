import { useCallback, useEffect, useRef } from "react";
import type { SelfMarkResult } from "../../types/schema";

interface Args {
  enabled: boolean;
  delayMs: number | undefined;
  currentQuestionId: string | undefined;
  currentAttemptResult: SelfMarkResult | null | undefined;
  nav: (direction: "next" | "prev") => Promise<void>;
}

/**
 * Advances to the next question a short delay after the current one is marked,
 * when the user has auto-advance enabled. Only the question that was just
 * marked (via `armForCurrentQuestion`) is eligible — navigating away and back
 * to an already-answered question does not re-trigger it.
 */
export function useAutoAdvance({ enabled, delayMs, currentQuestionId, currentAttemptResult, nav }: Args) {
  const autoAdvanceQuestionRef = useRef<string | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !currentQuestionId || !currentAttemptResult) {
      return;
    }

    if (autoAdvanceQuestionRef.current !== currentQuestionId) {
      return;
    }

    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }

    const delay = delayMs ?? 600;

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceQuestionRef.current = null;
      autoAdvanceTimerRef.current = null;
      void nav("next");
    }, delay);

    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [currentAttemptResult, currentQuestionId, nav, enabled, delayMs]);

  const armForCurrentQuestion = useCallback((questionId: string) => {
    autoAdvanceQuestionRef.current = questionId;
  }, []);

  return { armForCurrentQuestion };
}
