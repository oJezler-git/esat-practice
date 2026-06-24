import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelfMarkPanel } from "./SelfMarkPanel";

function defaultProps(overrides = {}) {
  return {
    correctAnswer: "C",
    onMark: vi.fn(),
    onReveal: vi.fn(),
    revealed: false,
    revealShortcutLabel: "Space",
    incorrectShortcutLabel: "N",
    ...overrides,
  };
}

describe("SelfMarkPanel — result already set", () => {
  it("shows 'Marked correct' for a correct result", () => {
    render(<SelfMarkPanel {...defaultProps({ result: "correct" })} />);
    expect(screen.getByText("Marked correct")).toBeInTheDocument();
  });

  it("shows 'Marked incorrect' for an incorrect result", () => {
    render(<SelfMarkPanel {...defaultProps({ result: "incorrect" })} />);
    expect(screen.getByText("Marked incorrect")).toBeInTheDocument();
  });

  it("shows 'Skipped' for a skipped result", () => {
    render(<SelfMarkPanel {...defaultProps({ result: "skipped" })} />);
    expect(screen.getByText("Skipped")).toBeInTheDocument();
  });

  it("displays the correct answer text in all three result states", () => {
    for (const result of ["correct", "incorrect", "skipped"] as const) {
      const { unmount } = render(
        <SelfMarkPanel {...defaultProps({ result, correctAnswer: "42" })} />
      );
      expect(screen.getAllByText("42").length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe("SelfMarkPanel — unrevealed (awaiting reveal)", () => {
  it("renders a 'Reveal answer' button", () => {
    render(<SelfMarkPanel {...defaultProps()} />);
    expect(screen.getByRole("button", { name: /reveal answer/i })).toBeInTheDocument();
  });

  it("calls onReveal when the reveal button is clicked", () => {
    const onReveal = vi.fn();
    render(<SelfMarkPanel {...defaultProps({ onReveal })} />);
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("adds hide-on-mobile class when hideRevealOnMobile is true", () => {
    render(<SelfMarkPanel {...defaultProps({ hideRevealOnMobile: true })} />);
    expect(screen.getByRole("button", { name: /reveal answer/i })).toHaveClass("hide-on-mobile");
  });

  it("does not add hide-on-mobile class when hideRevealOnMobile is false", () => {
    render(<SelfMarkPanel {...defaultProps({ hideRevealOnMobile: false })} />);
    expect(screen.getByRole("button", { name: /reveal answer/i })).not.toHaveClass("hide-on-mobile");
  });
});

describe("SelfMarkPanel — revealed, awaiting mark", () => {
  it("shows the 'Did you get it right?' prompt", () => {
    render(<SelfMarkPanel {...defaultProps({ revealed: true })} />);
    expect(screen.getByText("Did you get it right?")).toBeInTheDocument();
  });

  it("shows both Correct and Incorrect buttons", () => {
    render(<SelfMarkPanel {...defaultProps({ revealed: true })} />);
    expect(screen.getByRole("button", { name: /^Correct/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Incorrect/i })).toBeInTheDocument();
  });

  it("calls onMark('correct') when the Correct button is clicked", () => {
    const onMark = vi.fn();
    render(<SelfMarkPanel {...defaultProps({ revealed: true, onMark })} />);
    fireEvent.click(screen.getByRole("button", { name: /^Correct/i }));
    expect(onMark).toHaveBeenCalledWith("correct");
  });

  it("calls onMark('incorrect') when the Incorrect button is clicked", () => {
    const onMark = vi.fn();
    render(<SelfMarkPanel {...defaultProps({ revealed: true, onMark })} />);
    fireEvent.click(screen.getByRole("button", { name: /^Incorrect/i }));
    expect(onMark).toHaveBeenCalledWith("incorrect");
  });

  it("does not render the reveal button once revealed", () => {
    render(<SelfMarkPanel {...defaultProps({ revealed: true })} />);
    expect(screen.queryByRole("button", { name: /reveal answer/i })).toBeNull();
  });
});
