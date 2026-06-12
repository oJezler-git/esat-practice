export type ShortcutAction =
  | "revealCorrect"
  | "incorrect"
  | "prev"
  | "next"
  | "flag"
  | "skip";

export type ShortcutMap = Record<ShortcutAction, string>;

export interface UserSettings {
  defaultMode: "timed" | "untimed" | "topic" | "mixed";
  defaultQuestionCount: number;
  timedSecondsPerQ: number;
  examMode: boolean;
  showKeyboardHints: boolean;
  autoAdvance: boolean;
  autoAdvanceDelayMs: number;
  fontPreset: "academic" | "premium" | "readable";
  fontSize: "sm" | "md" | "lg";
  calculatorAllowed: boolean;
  targetYear: number;
  shortcuts: ShortcutMap;
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
  defaultQuestionCount: 20,
  timedSecondsPerQ: 90,
  examMode: true,
  showKeyboardHints: true,
  autoAdvance: true,
  autoAdvanceDelayMs: 600,
  fontPreset: "academic",
  fontSize: "md",
  calculatorAllowed: false,
  targetYear: new Date().getFullYear(),
  shortcuts: DEFAULT_SHORTCUTS,
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
