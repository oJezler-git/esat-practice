import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SelfMarkResult } from "../../types/schema";
import { AnswerInputPanel } from "./AnswerInputPanel";

function renderPanel(overrides: Partial<React.ComponentProps<typeof AnswerInputPanel>> = {}) {
  const handlers = {
    onRecordFirst: vi.fn(),
    onResolve: vi.fn(),
    onGiveUp: vi.fn(),
  };

  render(
    <AnswerInputPanel
      correctAnswer="C"
      revealed={false}
      onRecordFirst={handlers.onRecordFirst}
      onResolve={handlers.onResolve}
      onGiveUp={handlers.onGiveUp}
      {...overrides}
    />,
  );

  return handlers;
}

function type(answer: string) {
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: answer } });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
}

describe("AnswerInputPanel", () => {
  it("records correct and resolves on a right first guess (case-insensitive)", () => {
    const { onRecordFirst, onResolve } = renderPanel();

    type("c");

    expect(onRecordFirst).toHaveBeenCalledExactlyOnceWith("correct");
    expect(onResolve).toHaveBeenCalledOnce();
    expect(screen.getByText("Well done")).toBeInTheDocument();
  });

  it("records incorrect once but lets the user retry to the answer", () => {
    // Mirror the parent: storing the first guess sets `result`, so retries see
    // a scored question and must not record again.
    const onRecordFirst = vi.fn();
    const onResolve = vi.fn();

    function Harness() {
      const [result, setResult] = useState<SelfMarkResult | undefined>(undefined);
      return (
        <AnswerInputPanel
          correctAnswer="C"
          revealed={false}
          result={result}
          onRecordFirst={(r) => {
            onRecordFirst(r);
            setResult(r);
          }}
          onResolve={onResolve}
          onGiveUp={vi.fn()}
        />
      );
    }

    render(<Harness />);

    type("A");
    expect(onRecordFirst).toHaveBeenCalledExactlyOnceWith("incorrect");
    expect(screen.getByText(/is not correct/)).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();

    type("C");
    expect(onRecordFirst).toHaveBeenCalledOnce();
    expect(onResolve).toHaveBeenCalledOnce();
  });

  it("gives up via the reveal button", () => {
    const { onGiveUp } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));

    expect(onGiveUp).toHaveBeenCalledOnce();
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("shows the answer view when returning to an already-scored question", () => {
    renderPanel({ result: "incorrect", revealed: true });

    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});
