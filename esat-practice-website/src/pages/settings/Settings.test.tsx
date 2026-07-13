import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Settings from ".";
import { useSettingsStore } from "../../lib/settingsStore";
import { DEFAULT_PROMPT_TEMPLATE } from "../../lib/askClaude";
import { DEFAULT_SETTINGS } from "../../types/settings";

const mocks = vi.hoisted(() => ({
  includeQuestion: vi.fn(),
}));

vi.mock("../../components/CloudSyncSection", () => ({
  CloudSyncSection: () => <section aria-label="Cloud sync" />,
}));

vi.mock("../../components/DataManagementSection", () => ({
  DataManagementSection: () => <section aria-label="Data management" />,
}));

vi.mock("../../lib/offlineDownload", () => ({
  clearOfflineImageCache: vi.fn(),
  downloadAllImagesForOffline: vi.fn(),
  getCurrentDataVersion: vi.fn(() => new Promise(() => {})),
  getOfflineDownloadState: vi.fn(() => null),
}));

vi.mock("../../lib/excludedQuestionStore", () => ({
  useExcludedQuestionStore: () => ({
    excludedQuestions: [
      {
        question_id: "q1",
        excluded_at: 1,
        reason: "manual",
      },
    ],
    includeQuestion: mocks.includeQuestion,
  }),
}));

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  });

  it("renders high-use switches, buttons, and select controls by role and name", () => {
    renderSettings();

    expect(screen.getByRole("button", { name: "Reset to defaults" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /installation guide/i })).toBeInTheDocument();

    expect(screen.getByRole("switch", { name: "Exam mode" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Auto-advance" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Fullscreen on start" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Show keyboard hints" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Maths" })).toBeChecked();

    expect(screen.getByRole("combobox", { name: "Default mode" })).toHaveValue("untimed");
    expect(screen.getByRole("combobox", { name: "Appearance" })).toHaveValue("auto");
    expect(screen.getByRole("combobox", { name: "Interface font" })).toHaveValue("academic");
    expect(screen.getByRole("combobox", { name: "Question font size" })).toHaveValue("md");
  });

  it("updates numeric controls and conditional defaults by accessible name", () => {
    renderSettings();

    fireEvent.change(screen.getByRole("slider", { name: "Default question count" }), {
      target: { value: "42" },
    });
    expect(useSettingsStore.getState().settings.defaultQuestionCount).toBe(42);
    expect(screen.getByRole("spinbutton", { name: "Default question count" })).toHaveValue(42);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Seconds per question" }), {
      target: { value: "120" },
    });
    expect(useSettingsStore.getState().settings.timedSecondsPerQ).toBe(120);

    fireEvent.change(screen.getByRole("slider", { name: "Auto-advance delay" }), {
      target: { value: "1000" },
    });
    expect(useSettingsStore.getState().settings.autoAdvanceDelayMs).toBe(1000);

    fireEvent.click(screen.getByRole("switch", { name: "Auto-exclude answered questions" }));
    expect(screen.getByRole("combobox", { name: "Exclude when" })).toHaveValue("attempted");
  });

  it("supports keyboard shortcut changes and shortcut reset controls", () => {
    renderSettings();

    const revealShortcut = screen.getByRole("button", { name: "Reveal / mark correct" });
    fireEvent.focus(revealShortcut);
    fireEvent.keyDown(revealShortcut, { key: "q" });

    expect(useSettingsStore.getState().settings.shortcuts.revealCorrect).toBe("q");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(useSettingsStore.getState().settings.shortcuts.revealCorrect).toBe("Space");
  });

  it("supports Ask Claude preference controls and prompt defaults", () => {
    renderSettings();

    fireEvent.change(screen.getByRole("combobox", { name: "Integration mode" }), {
      target: { value: "manual" },
    });
    expect(useSettingsStore.getState().settings.claudeMode).toBe("manual");

    fireEvent.change(screen.getByRole("textbox", { name: "Prompt template" }), {
      target: { value: "Custom prompt" },
    });
    expect(useSettingsStore.getState().settings.claudePromptTemplate).toBe("Custom prompt");

    fireEvent.click(screen.getByRole("button", { name: "{{answer}}" }));
    expect(useSettingsStore.getState().settings.claudePromptTemplate).toBe("Custom prompt{{answer}}");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(useSettingsStore.getState().settings.claudePromptTemplate).toBe(DEFAULT_PROMPT_TEMPLATE);
  });

  it("updates display preferences: colour theme, appearance, fonts", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("radio", { name: "Emerald" }));
    expect(useSettingsStore.getState().settings.colorTheme).toBe("emerald");

    fireEvent.change(screen.getByRole("combobox", { name: "Appearance" }), {
      target: { value: "light" },
    });
    expect(useSettingsStore.getState().settings.theme).toBe("light");

    fireEvent.change(screen.getByRole("combobox", { name: "Interface font" }), {
      target: { value: "monospace" },
    });
    expect(useSettingsStore.getState().settings.fontPreset).toBe("monospace");

    fireEvent.change(screen.getByRole("combobox", { name: "Question font size" }), {
      target: { value: "lg" },
    });
    expect(useSettingsStore.getState().settings.fontSize).toBe("lg");
  });

  it("changes the auto-exclude predicate once enabled", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("switch", { name: "Auto-exclude answered questions" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Exclude when" }), {
      target: { value: "correct" },
    });
    expect(useSettingsStore.getState().settings.autoExcludeOn).toBe("correct");
  });

  it("Reset pool re-adds every excluded question only after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderSettings();

    const resetPool = screen.getByRole("button", { name: "Reset pool" });
    fireEvent.click(resetPool);
    expect(mocks.includeQuestion).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(resetPool);
    await waitFor(() => {
      expect(mocks.includeQuestion).toHaveBeenCalledWith("q1");
    });
    expect(confirmSpy).toHaveBeenCalledWith("Re-add all 1 excluded questions to the pool?");
  });

  it("assigning a shortcut key already in use swaps the two shortcuts", () => {
    renderSettings();

    // Give "Mark incorrect" the key currently held by "Next question".
    const nextKey = DEFAULT_SETTINGS.shortcuts.next;
    const incorrectKey = DEFAULT_SETTINGS.shortcuts.incorrect;
    const incorrectInput = screen.getByRole("button", { name: "Mark incorrect" });
    fireEvent.focus(incorrectInput);
    fireEvent.keyDown(incorrectInput, { key: nextKey });

    const { shortcuts } = useSettingsStore.getState().settings;
    expect(shortcuts.incorrect).toBe(nextKey);
    expect(shortcuts.next).toBe(incorrectKey);
  });

  it("mounts the Ask Claude installation guide modal on request", () => {
    // Open/close behaviour of the native <dialog> itself is covered by
    // AskClaudeInfoModal.test.tsx; here we only assert the section wires the
    // button to mounting the modal.
    renderSettings();

    expect(document.querySelector("dialog.ask-claude-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /installation guide/i }));
    expect(document.querySelector("dialog.ask-claude-modal")).toBeInTheDocument();
  });

  it("resets all settings to defaults after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useSettingsStore.getState().update({ examMode: false, defaultQuestionCount: 12 });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    expect(window.confirm).toHaveBeenCalledWith("Reset all settings to defaults?");
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});
