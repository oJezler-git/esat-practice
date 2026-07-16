import { useCallback, useEffect, useRef, useState } from "react";

interface Args {
  enabled: boolean;
  delayMs: number | undefined;
  currentQuestionId: string | undefined;
  nav: (direction: "next" | "prev") => Promise<void>;
}

/**
 * Advances to the next question a short delay after the current one is resolved,
 * when the user has auto-advance enabled. Only the question that was just
 * resolved (via `armForCurrentQuestion`) is eligible — navigating away and back
 * to an already-answered question does not re-trigger it.
 *
 * Scheduling keys off an arm token rather than the recorded result, so it fires
 * on every arm even when the stored result is unchanged: in answer-input mode a
 * correct retry (which doesn't re-record) or a give-up after an earlier wrong
 * guess must still advance.
 */
export function useAutoAdvance({ enabled, delayMs, currentQuestionId, nav }: Args) {
  const autoAdvanceQuestionRef = useRef<string | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const [armToken, setArmToken] = useState(0);

  useEffect(() => {
    if (!enabled || !currentQuestionId) {
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
  }, [armToken, currentQuestionId, nav, enabled, delayMs]);

  const armForCurrentQuestion = useCallback((questionId: string) => {
    autoAdvanceQuestionRef.current = questionId;
    // Bump the token so the effect re-runs and (re)schedules the advance, even
    // when no other input to the effect has changed.
    setArmToken((token) => token + 1);
  }, []);

  return { armForCurrentQuestion };
}
