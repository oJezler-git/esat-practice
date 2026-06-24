import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "./settingsStore";
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from "../types/settings";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().reset();
});

describe("update", () => {
  it("merges a partial settings patch without overwriting other fields", () => {
    useSettingsStore.getState().update({ defaultQuestionCount: 30 });
    const { settings } = useSettingsStore.getState();
    expect(settings.defaultQuestionCount).toBe(30);
    expect(settings.defaultMode).toBe(DEFAULT_SETTINGS.defaultMode);
    expect(settings.examMode).toBe(DEFAULT_SETTINGS.examMode);
  });

  it("normalises a space character shortcut to 'Space'", () => {
    useSettingsStore.getState().update({
      shortcuts: { ...DEFAULT_SHORTCUTS, revealCorrect: " " },
    });
    expect(useSettingsStore.getState().settings.shortcuts.revealCorrect).toBe("Space");
  });

  it("normalises 'Spacebar' to 'Space'", () => {
    useSettingsStore.getState().update({
      shortcuts: { ...DEFAULT_SHORTCUTS, revealCorrect: "Spacebar" },
    });
    expect(useSettingsStore.getState().settings.shortcuts.revealCorrect).toBe("Space");
  });

  it("lowercases a single-character shortcut", () => {
    useSettingsStore.getState().update({
      shortcuts: { ...DEFAULT_SHORTCUTS, flag: "F" },
    });
    expect(useSettingsStore.getState().settings.shortcuts.flag).toBe("f");
  });

  it("falls back to the default for an invalid shortcut key", () => {
    useSettingsStore.getState().update({
      shortcuts: { ...DEFAULT_SHORTCUTS, revealCorrect: "InvalidKey" },
    });
    expect(useSettingsStore.getState().settings.shortcuts.revealCorrect).toBe(
      DEFAULT_SHORTCUTS.revealCorrect,
    );
  });

  it("accepts valid named keys such as ArrowLeft and Enter", () => {
    useSettingsStore.getState().update({
      shortcuts: { ...DEFAULT_SHORTCUTS, prev: "ArrowLeft", next: "Enter" },
    });
    const { shortcuts } = useSettingsStore.getState().settings;
    expect(shortcuts.prev).toBe("ArrowLeft");
    expect(shortcuts.next).toBe("Enter");
  });

  it("preserves existing shortcuts when patch does not include shortcuts", () => {
    useSettingsStore.getState().update({
      shortcuts: { ...DEFAULT_SHORTCUTS, flag: "g" },
    });
    useSettingsStore.getState().update({ defaultQuestionCount: 25 });
    expect(useSettingsStore.getState().settings.shortcuts.flag).toBe("g");
  });
});

describe("reset", () => {
  it("restores all settings to DEFAULT_SETTINGS", () => {
    useSettingsStore.getState().update({
      defaultQuestionCount: 99,
      examMode: false,
      shortcuts: { ...DEFAULT_SHORTCUTS, flag: "z" },
    });
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe("shortcut sanitisation during update with partial shortcuts", () => {
  it("fills in missing shortcut keys from defaults when patch provides only some", () => {
    useSettingsStore.getState().update({
      shortcuts: { ...DEFAULT_SHORTCUTS, revealCorrect: "x" },
    });
    const { shortcuts } = useSettingsStore.getState().settings;
    expect(shortcuts.revealCorrect).toBe("x");
    expect(shortcuts.next).toBe(DEFAULT_SHORTCUTS.next);
    expect(shortcuts.prev).toBe(DEFAULT_SHORTCUTS.prev);
    expect(shortcuts.flag).toBe(DEFAULT_SHORTCUTS.flag);
    expect(shortcuts.skip).toBe(DEFAULT_SHORTCUTS.skip);
    expect(shortcuts.incorrect).toBe(DEFAULT_SHORTCUTS.incorrect);
  });
});
