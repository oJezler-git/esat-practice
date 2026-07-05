import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NavControls } from "./NavControls";

function defaultProps(overrides = {}) {
  return {
    currentIndex: 1,
    totalCount: 5,
    currentAnswered: true,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}

describe("NavControls — Prev button", () => {
  it("is disabled when currentIndex is 0", () => {
    render(<NavControls {...defaultProps({ currentIndex: 0 })} />);
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
  });

  it("is enabled when currentIndex is greater than 0", () => {
    render(<NavControls {...defaultProps({ currentIndex: 1 })} />);
    expect(screen.getByRole("button", { name: /prev/i })).not.toBeDisabled();
  });

  it("calls onPrev when clicked", () => {
    const onPrev = vi.fn();
    render(<NavControls {...defaultProps({ currentIndex: 2, onPrev })} />);
    fireEvent.click(screen.getByRole("button", { name: /prev/i }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });
});

describe("NavControls — Next vs Submit", () => {
  it("shows Next (not Submit) when not on the last question", () => {
    render(<NavControls {...defaultProps({ currentIndex: 1, totalCount: 5 })} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit session/i })).toBeNull();
  });

  it("calls onNext when the Next button is clicked", () => {
    const onNext = vi.fn();
    render(<NavControls {...defaultProps({ currentIndex: 2, totalCount: 5, onNext })} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("shows Submit (not Next) on the last question", () => {
    render(<NavControls {...defaultProps({ currentIndex: 4, totalCount: 5 })} />);
    expect(screen.getByRole("button", { name: /submit session/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
  });

  it("Submit is disabled when currentAnswered is false", () => {
    render(
      <NavControls {...defaultProps({ currentIndex: 4, totalCount: 5, currentAnswered: false })} />
    );
    expect(screen.getByRole("button", { name: /submit session/i })).toBeDisabled();
  });

  it("Submit is enabled when currentAnswered is true", () => {
    render(
      <NavControls {...defaultProps({ currentIndex: 4, totalCount: 5, currentAnswered: true })} />
    );
    expect(screen.getByRole("button", { name: /submit session/i })).not.toBeDisabled();
  });

  it("calls onSubmit when the Submit button is clicked", () => {
    const onSubmit = vi.fn();
    render(
      <NavControls {...defaultProps({ currentIndex: 4, totalCount: 5, currentAnswered: true, onSubmit })} />
    );
    fireEvent.click(screen.getByRole("button", { name: /submit session/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("NavControls — Reveal button", () => {
  it("renders Reveal when onReveal is provided and revealed is false", () => {
    render(<NavControls {...defaultProps({ onReveal: vi.fn(), revealed: false })} />);
    expect(screen.getByRole("button", { name: /reveal/i })).toBeInTheDocument();
  });

  it("does not render Reveal when revealed is true", () => {
    render(<NavControls {...defaultProps({ onReveal: vi.fn(), revealed: true })} />);
    expect(screen.queryByRole("button", { name: /reveal/i })).toBeNull();
  });

  it("does not render Reveal when onReveal is not provided", () => {
    render(<NavControls {...defaultProps()} />);
    expect(screen.queryByRole("button", { name: /reveal/i })).toBeNull();
  });

  it("calls onReveal when the Reveal button is clicked", () => {
    const onReveal = vi.fn();
    render(<NavControls {...defaultProps({ onReveal, revealed: false })} />);
    fireEvent.click(screen.getByRole("button", { name: /reveal/i }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});
