import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AskClaudeButton } from "./AskClaudeButton";
import { askClaudeBasic, askClaudeWithScript } from "../lib/askClaude";
import { useSettingsStore } from "../lib/settingsStore";
import { DEFAULT_SETTINGS, type UserSettings } from "../types/settings";
import { makeQuestion } from "../test-utils/factories";

vi.mock("../lib/askClaude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/askClaude")>()),
  askClaudeBasic: vi.fn(),
  askClaudeWithScript: vi.fn(),
}));

vi.mock("./AskClaudeInfoModal", () => ({
  AskClaudeInfoModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Ask Claude info">
      <button type="button" onClick={onClose}>Close info</button>
    </div>
  ),
}));

const question = makeQuestion({ id: "q-ask" });

function setSettings(overrides: Partial<UserSettings>) {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, ...overrides } });
}

describe("AskClaudeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).__esatExtension;
    setSettings({ claudeOnboarded: true, claudeMode: "manual" });
  });

  it("is disabled until the user has read the onboarding modal", () => {
    setSettings({ claudeOnboarded: false, claudeMode: "manual" });
    render(<AskClaudeButton question={question} />);

    expect(screen.getByRole("button", { name: /Ask Claude/ })).toBeDisabled();

    // The learn-more link opens the info modal, and it can be dismissed.
    fireEvent.click(screen.getByRole("button", { name: "Read how it works to continue →" }));
    expect(screen.getByRole("dialog", { name: "Ask Claude info" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close info" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("copies the prompt in manual mode and resets to idle after a pause", async () => {
    vi.mocked(askClaudeBasic).mockResolvedValue(undefined);
    // Fake timers from the start so the 4s reset timer is captured.
    vi.useFakeTimers();
    try {
      render(<AskClaudeButton question={question} />);

      fireEvent.click(screen.getByRole("button", { name: /Ask Claude/ }));
      await act(async () => {}); // flush the resolved askClaudeBasic promise

      expect(screen.getByText("Paste into Claude")).toBeInTheDocument();
      expect(screen.getByText("Prompt is on your clipboard")).toBeInTheDocument();
      expect(askClaudeBasic).toHaveBeenCalledWith(question, expect.any(String));
      expect(askClaudeWithScript).not.toHaveBeenCalled();

      // The done state clears back to idle on a 4s timer.
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByText("Ask Claude (Experimental)")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces the error message when the copy fails", async () => {
    vi.mocked(askClaudeBasic).mockRejectedValue(new Error("Clipboard blocked"));
    render(<AskClaudeButton question={question} />);

    fireEvent.click(screen.getByRole("button", { name: /Ask Claude/ }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
    expect(screen.getByText("Clipboard blocked")).toBeInTheDocument();
  });

  it("hands off to the extension when the mode forces it", async () => {
    setSettings({ claudeOnboarded: true, claudeMode: "extension" });
    render(<AskClaudeButton question={question} />);

    fireEvent.click(screen.getByRole("button", { name: /Ask Claude/ }));

    await waitFor(() => {
      expect(screen.getByText("Sent to Claude!")).toBeInTheDocument();
    });
    expect(screen.getByText("Extension received — Claude opening")).toBeInTheDocument();
    expect(askClaudeWithScript).toHaveBeenCalledWith(question, expect.any(String), false);
    expect(askClaudeBasic).not.toHaveBeenCalled();
  });

  it("auto mode switches to the extension when it announces itself", () => {
    setSettings({ claudeOnboarded: true, claudeMode: "auto" });
    const { container } = render(<AskClaudeButton question={question} />);

    // Without the extension, auto mode shows the manual learn-more link.
    expect(container.querySelector(".ask-claude-wrap")).not.toHaveAttribute("data-extension");
    expect(screen.getByRole("button", { name: "How does this work?" })).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new Event("esat-extension-ready"));
    });
    expect(container.querySelector(".ask-claude-wrap")).toHaveAttribute("data-extension", "true");
    expect(screen.queryByRole("button", { name: "How does this work?" })).not.toBeInTheDocument();
  });
});
