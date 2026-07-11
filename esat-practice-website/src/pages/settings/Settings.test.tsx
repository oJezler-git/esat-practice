import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("combobox", { name: "Appearance" })).toHaveValue("dark");
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

  it("resets all settings to defaults after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useSettingsStore.getState().update({ examMode: false, defaultQuestionCount: 12 });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    expect(window.confirm).toHaveBeenCalledWith("Reset all settings to defaults?");
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});
