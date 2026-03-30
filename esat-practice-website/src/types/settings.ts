export interface UserSettings {
  defaultMode: "timed" | "untimed" | "topic" | "mixed";
  defaultQuestionCount: number;
  timedSecondsPerQ: number;
  examMode: boolean;
  showKeyboardHints: boolean;
  autoAdvance: boolean;
  fontPreset: "academic" | "premium" | "readable";
  fontSize: "sm" | "md" | "lg";
  calculatorAllowed: boolean;
  targetYear: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultMode: "untimed",
  defaultQuestionCount: 20,
  timedSecondsPerQ: 90,
  examMode: false,
  showKeyboardHints: true,
  autoAdvance: false,
  fontPreset: "academic",
  fontSize: "md",
  calculatorAllowed: false,
  targetYear: new Date().getFullYear(),
};
