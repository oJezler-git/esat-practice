import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileRevealPopup } from "./MobileRevealPopup";

function renderPopup() {
  const handlers = {
    onClose: vi.fn(),
    onMarkCorrect: vi.fn(),
    onMarkIncorrect: vi.fn(),
  };

  render(
    <MobileRevealPopup
      correctAnswer="B"
      onClose={handlers.onClose}
      onMarkCorrect={handlers.onMarkCorrect}
      onMarkIncorrect={handlers.onMarkIncorrect}
    />,
  );

  return handlers;
}

describe("MobileRevealPopup", () => {
  it("shows the correct answer in an accessible dialog", () => {
    renderPopup();

    expect(screen.getByRole("dialog", { name: "Correct answer" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("closes from the labelled close button", () => {
    const { onClose } = renderPopup();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls the correct and incorrect mark handlers", () => {
    const { onMarkCorrect, onMarkIncorrect } = renderPopup();

    fireEvent.click(screen.getByRole("button", { name: "Correct" }));
    fireEvent.click(screen.getByRole("button", { name: "Incorrect" }));

    expect(onMarkCorrect).toHaveBeenCalledOnce();
    expect(onMarkIncorrect).toHaveBeenCalledOnce();
  });
});
