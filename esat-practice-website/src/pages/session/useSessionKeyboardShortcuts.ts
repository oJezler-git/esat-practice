import { useCallback, useEffect } from "react";
import {
  normalizeShortcutKey,
  type ShortcutAction,
} from "../../types/settings";
import type { SelfMarkResult } from "../../types/schema";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    tagName === "BUTTON"
  );
}

interface Args {
  shortcuts: Record<ShortcutAction, string>;
  currentAttemptResult: SelfMarkResult | null | undefined;
  isAnswerRevealed: boolean;
  /**
   * Whether the reveal/correct/incorrect self-mark keys are active. Off in
   * answer-input mode, where those actions don't exist. Defaults to on.
   */
  selfMarkEnabled?: boolean;
  revealAnswer: () => void;
  handleMark: (result: SelfMarkResult) => void;
  nav: (direction: "next" | "prev") => Promise<void>;
  flag: () => Promise<void>;
  skip: () => Promise<void>;
}

/** Wires the global keydown listener that maps configured shortcut keys to session actions. */
export function useSessionKeyboardShortcuts({
  shortcuts,
  currentAttemptResult,
  isAnswerRevealed,
  selfMarkEnabled = true,
  revealAnswer,
  handleMark,
  nav,
  flag,
  skip,
}: Args) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isInteractiveTarget(event.target)
      ) {
        return;
      }

      const key = normalizeShortcutKey(event.key);
      if (!key) {
        return;
      }

      const action = (
        Object.entries(shortcuts).find(([, shortcut]) => shortcut === key)?.[0] ??
        null
      ) as ShortcutAction | null;

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "revealCorrect") {
        if (!selfMarkEnabled || currentAttemptResult) {
          return;
        }

        if (!isAnswerRevealed) {
          revealAnswer();
          return;
        }

        handleMark("correct");
      } else if (action === "incorrect") {
        if (!selfMarkEnabled) {
          return;
        }
        handleMark("incorrect");
      } else if (action === "next") {
        void nav("next");
      } else if (action === "prev") {
        void nav("prev");
      } else if (action === "flag") {
        void flag();
      } else if (action === "skip") {
        void skip();
      }
    },
    [
      currentAttemptResult,
      flag,
      handleMark,
      isAnswerRevealed,
      nav,
      revealAnswer,
      selfMarkEnabled,
      shortcuts,
      skip,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
