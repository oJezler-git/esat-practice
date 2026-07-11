import { act, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useAutoAdvance } from "./useAutoAdvance";
import type { SelfMarkResult } from "../../types/schema";

function AutoAdvanceHarness({
  enabled = true,
  delayMs,
  nav,
}: {
  enabled?: boolean;
  delayMs?: number;
  nav: (direction: "next" | "prev") => Promise<void>;
}) {
  const [questionId, setQuestionId] = useState("q1");
  const [result, setResult] = useState<SelfMarkResult | null>(null);
  const { armForCurrentQuestion } = useAutoAdvance({
    enabled,
    delayMs,
    currentQuestionId: questionId,
    currentAttemptResult: result,
    nav,
  });

  return (
    <div>
      <button type="button" onClick={() => armForCurrentQuestion(questionId)}>
        Arm
      </button>
      <button type="button" onClick={() => setResult("correct")}>
        Mark
      </button>
      <button
        type="button"
        onClick={() => {
          setQuestionId("q2");
          setResult(null);
        }}
      >
        Next question
      </button>
    </div>
  );
}

describe("useAutoAdvance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances after the configured delay when the armed question is marked", () => {
    const nav = vi.fn().mockResolvedValue(undefined);
    render(<AutoAdvanceHarness delayMs={250} nav={nav} />);

    act(() => {
      screen.getByRole("button", { name: "Arm" }).click();
      screen.getByRole("button", { name: "Mark" }).click();
    });

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(nav).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(nav).toHaveBeenCalledWith("next");
  });

  it("uses the default delay when none is provided", () => {
    const nav = vi.fn().mockResolvedValue(undefined);
    render(<AutoAdvanceHarness nav={nav} />);

    act(() => {
      screen.getByRole("button", { name: "Arm" }).click();
      screen.getByRole("button", { name: "Mark" }).click();
    });

    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(nav).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(nav).toHaveBeenCalledWith("next");
  });

  it("does not advance when disabled or when an unarmed question is marked", () => {
    const disabledNav = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<AutoAdvanceHarness enabled={false} nav={disabledNav} />);

    act(() => {
      screen.getByRole("button", { name: "Arm" }).click();
      screen.getByRole("button", { name: "Mark" }).click();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(disabledNav).not.toHaveBeenCalled();

    unmount();

    const unarmedNav = vi.fn().mockResolvedValue(undefined);
    render(<AutoAdvanceHarness nav={unarmedNav} />);

    act(() => {
      screen.getByRole("button", { name: "Mark" }).click();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(unarmedNav).not.toHaveBeenCalled();
  });

  it("cleans up a pending timer when the question changes", () => {
    const nav = vi.fn().mockResolvedValue(undefined);
    render(<AutoAdvanceHarness delayMs={250} nav={nav} />);

    act(() => {
      screen.getByRole("button", { name: "Arm" }).click();
      screen.getByRole("button", { name: "Mark" }).click();
      screen.getByRole("button", { name: "Next question" }).click();
    });

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(nav).not.toHaveBeenCalled();
  });
});
