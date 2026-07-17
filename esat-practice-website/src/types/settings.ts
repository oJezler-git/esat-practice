import { DEFAULT_PROMPT_TEMPLATE } from "../lib/askClaude";
import type { Subject } from "../lib/subjects";

export type ShortcutAction =
  | "revealCorrect"
  | "incorrect"
  | "prev"
  | "next"
  | "flag"
  | "skip";

export type ShortcutMap = Record<ShortcutAction, string>;

export type AutoExcludeOn = "any" | "attempted" | "correct";

export type ClaudeMode = "auto" | "extension" | "manual";

export interface UserSettings {
  defaultMode: "timed" | "untimed" | "topic" | "mixed";
  defaultQuestionCount: number;
  timedSecondsPerQ: number;
  examMode: boolean;
  /**
   * Untimed sessions only. Replaces self-marking (reveal → "did you get it
   * right?") with typing the answer letter and being told correct/incorrect,
   * with unlimited retries. The first guess is what scores.
   */
  answerInputMode: boolean;
  showKeyboardHints: boolean;
  autoAdvance: boolean;
  autoAdvanceDelayMs: number;
  fullscreenOnStart: boolean;
  fontPreset: "academic" | "premium" | "readable" | "modern" | "technical" | "inter" | "monospace";
  theme: "auto" | "dark" | "light";
  colorTheme: "amber" | "rose" | "emerald" | "teal" | "azure" | "indigo";
  skin: "skeuo" | "plain";
  soundEffects: boolean;
  fontSize: "sm" | "md" | "lg";
  shortcuts: ShortcutMap;
  autoExclude: boolean;
  autoExcludeOn: AutoExcludeOn;
  claudeMode: ClaudeMode;
  claudeOnboarded: boolean;
  claudePromptTemplate: string;
  enabledSubjects: Subject[];
  /** Opt-in daily practice reminder via web push. */
  remindersEnabled: boolean;
  /** Local time for the daily reminder, "HH:MM" 24-hour. */
  reminderTime: string;
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  revealCorrect: "Space",
  incorrect: "n",
  prev: "ArrowLeft",
  next: "ArrowRight",
  flag: "f",
  skip: "s",
};

export const DEFAULT_SETTINGS: UserSettings = {
  defaultMode: "untimed",
  defaultQuestionCount: 27,
  timedSecondsPerQ: 90,
  examMode: true,
  answerInputMode: false,
  showKeyboardHints: true,
  autoAdvance: true,
  autoAdvanceDelayMs: 600,
  fullscreenOnStart: true,
  fontPreset: "academic",
  theme: "auto",
  colorTheme: "amber",
  skin: "skeuo",
  soundEffects: false,
  fontSize: "md",
  shortcuts: DEFAULT_SHORTCUTS,
  autoExclude: false,
  autoExcludeOn: "attempted",
  claudeMode: "auto",
  claudeOnboarded: false,
  claudePromptTemplate: DEFAULT_PROMPT_TEMPLATE,
  enabledSubjects: ["maths1", "maths2", "physics"],
  remindersEnabled: false,
  reminderTime: "18:00",
};

export function normalizeShortcutKey(key: string): string | null {
  if (!key) {
    return null;
  }

  if (key === " " || key === "Spacebar") {
    return "Space";
  }

  if (key.length === 1) {
    return key.toLowerCase();
  }

  const allowedNamedKeys = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Enter",
    "Escape",
    "Tab",
    "Backspace",
  ]);

  return allowedNamedKeys.has(key) ? key : null;
}

export function formatShortcutKey(key: string): string {
  switch (key) {
    case "Space":
      return "Space";
    case "ArrowLeft":
      return "Left";
    case "ArrowRight":
      return "Right";
    case "ArrowUp":
      return "Up";
    case "ArrowDown":
      return "Down";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}
