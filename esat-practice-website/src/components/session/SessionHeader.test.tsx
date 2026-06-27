import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionHeader, formatTime } from "./SessionHeader";

const defaultProps = {
  currentIndex: 0,
  isFlagged: false,
  onFlag: vi.fn(),
  onNavigate: vi.fn(),
  responses: {},
  questionIds: ["q1", "q2", "q3"],
};

describe("formatTime", () => {
  it("formats 0 ms as 0:00", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("formats 59 999 ms as 0:59", () => {
    expect(formatTime(59_999)).toBe("0:59");
  });

  it("formats exactly 60 000 ms as 1:00", () => {
    expect(formatTime(60_000)).toBe("1:00");
  });

  it("formats 3 661 000 ms as 61:01", () => {
    expect(formatTime(3_661_000)).toBe("61:01");
  });

  it("pads single-digit seconds with a leading zero", () => {
    expect(formatTime(65_000)).toBe("1:05");
  });

  it("formats exactly one minute", () => {
    expect(formatTime(60_000)).toBe("1:00");
  });
});

describe("SessionHeader — time display", () => {
  it("renders no time element when timeRemaining is not provided", () => {
    render(<SessionHeader {...defaultProps} />);
    expect(screen.queryByText(/:/)).toBeNull();
  });

  it("renders the formatted time when timeRemaining is provided", () => {
    render(<SessionHeader {...defaultProps} timeRemaining={90_000} />);
    expect(screen.getByText("1:30")).toBeInTheDocument();
  });

  it("renders 0:00 when timeRemaining is 0", () => {
    render(<SessionHeader {...defaultProps} timeRemaining={0} />);
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});

describe("SessionHeader — flag button", () => {
  it("calls onFlag when the flag button is clicked", () => {
    const onFlag = vi.fn();
    render(<SessionHeader {...defaultProps} onFlag={onFlag} />);
    fireEvent.click(screen.getByTitle("Flag question (F)"));
    expect(onFlag).toHaveBeenCalledOnce();
  });

  it("shows flagged styling when isFlagged is true", () => {
    render(<SessionHeader {...defaultProps} isFlagged={true} />);
    const btn = screen.getByTitle("Flag question (F)");
    expect(btn.className).toContain("text-amber");
  });

  it("shows unflagged styling when isFlagged is false", () => {
    render(<SessionHeader {...defaultProps} isFlagged={false} />);
    const btn = screen.getByTitle("Flag question (F)");
    expect(btn.className).toContain("text-muted");
  });
});

describe("SessionHeader — question navigation indicators", () => {
  it("renders one button per question ID", () => {
    render(<SessionHeader {...defaultProps} questionIds={["q1", "q2", "q3"]} />);
    // 3 navigation dots + fullscreen button + flag button = 5 buttons
    const navButtons = screen
      .getAllByRole("button")
      .filter((b) => b.title?.startsWith("Question "));
    expect(navButtons).toHaveLength(3);
  });

  it("calls onNavigate with the clicked index", () => {
    const onNavigate = vi.fn();
    render(
      <SessionHeader
        {...defaultProps}
        onNavigate={onNavigate}
        questionIds={["q1", "q2", "q3"]}
      />,
    );
    const [, , third] = screen
      .getAllByRole("button")
      .filter((b) => b.title?.startsWith("Question "));
    fireEvent.click(third);
    expect(onNavigate).toHaveBeenCalledWith(2);
  });
});
