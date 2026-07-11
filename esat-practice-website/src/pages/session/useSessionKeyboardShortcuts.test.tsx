import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useSessionKeyboardShortcuts } from "./useSessionKeyboardShortcuts";
import type { ShortcutMap } from "../../types/settings";
import type { SelfMarkResult } from "../../types/schema";

const customShortcuts: ShortcutMap = {
  revealCorrect: "x",
  incorrect: "i",
  prev: "a",
  next: "d",
  flag: "g",
  skip: "k",
};

function HookHarness({
  shortcuts = customShortcuts,
  currentAttemptResult,
  revealAnswer = vi.fn(),
  handleMark = vi.fn(),
  nav = vi.fn().mockResolvedValue(undefined),
  flag = vi.fn().mockResolvedValue(undefined),
  skip = vi.fn().mockResolvedValue(undefined),
}: {
  shortcuts?: ShortcutMap;
  currentAttemptResult?: SelfMarkResult | null;
  revealAnswer?: () => void;
  handleMark?: (result: SelfMarkResult) => void;
  nav?: (direction: "next" | "prev") => Promise<void>;
  flag?: () => Promise<void>;
  skip?: () => Promise<void>;
}) {
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  useSessionKeyboardShortcuts({
    shortcuts,
    currentAttemptResult,
    isAnswerRevealed,
    revealAnswer: () => {
      revealAnswer();
      setIsAnswerRevealed(true);
    },
    handleMark,
    nav,
    flag,
    skip,
  });

  return (
    <div>
      <input aria-label="answer input" />
      <textarea aria-label="notes" />
      <select aria-label="mode">
        <option>Untimed</option>
      </select>
      <button type="button">Focusable button</button>
    </div>
  );
}

describe("useSessionKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses custom shortcuts to reveal and then mark correct", () => {
    const revealAnswer = vi.fn();
    const handleMark = vi.fn();

    render(<HookHarness revealAnswer={revealAnswer} handleMark={handleMark} />);

    fireEvent.keyDown(window, { key: "x" });
    expect(revealAnswer).toHaveBeenCalledTimes(1);
    expect(handleMark).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "x" });
    expect(handleMark).toHaveBeenCalledWith("correct");
  });

  it("marks incorrect without requiring the answer to be revealed", () => {
    const handleMark = vi.fn();

    render(<HookHarness handleMark={handleMark} />);

    fireEvent.keyDown(window, { key: "i" });

    expect(handleMark).toHaveBeenCalledWith("incorrect");
  });

  it("ignores configured shortcuts from inputs, textareas, selects, and buttons", () => {
    const revealAnswer = vi.fn();

    render(<HookHarness revealAnswer={revealAnswer} />);

    fireEvent.keyDown(screen.getByLabelText("answer input"), { key: "x" });
    fireEvent.keyDown(screen.getByLabelText("notes"), { key: "x" });
    fireEvent.keyDown(screen.getByLabelText("mode"), { key: "x" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Focusable button" }), {
      key: "x",
    });

    expect(revealAnswer).not.toHaveBeenCalled();
  });

  it("ignores modifier-key shortcuts", () => {
    const revealAnswer = vi.fn();

    render(<HookHarness revealAnswer={revealAnswer} />);

    fireEvent.keyDown(window, { key: "x", ctrlKey: true });
    fireEvent.keyDown(window, { key: "x", metaKey: true });
    fireEvent.keyDown(window, { key: "x", altKey: true });

    expect(revealAnswer).not.toHaveBeenCalled();
  });

  it("maps skip, flag, next, and previous shortcuts", () => {
    const nav = vi.fn().mockResolvedValue(undefined);
    const flag = vi.fn().mockResolvedValue(undefined);
    const skip = vi.fn().mockResolvedValue(undefined);

    render(<HookHarness nav={nav} flag={flag} skip={skip} />);

    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });
    fireEvent.keyDown(window, { key: "a" });

    expect(skip).toHaveBeenCalledTimes(1);
    expect(flag).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenNthCalledWith(1, "next");
    expect(nav).toHaveBeenNthCalledWith(2, "prev");
  });

  it("does not reveal again when the current question already has an attempt result", () => {
    const revealAnswer = vi.fn();
    const handleMark = vi.fn();

    render(
      <HookHarness
        currentAttemptResult="incorrect"
        revealAnswer={revealAnswer}
        handleMark={handleMark}
      />,
    );

    fireEvent.keyDown(window, { key: "x" });

    expect(revealAnswer).not.toHaveBeenCalled();
    expect(handleMark).not.toHaveBeenCalled();
  });
});
