import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChoiceGrid } from "./ChoiceGrid";

describe("ChoiceGrid", () => {
  const choices = [
    { label: "A", text: "Option A" },
    { label: "B", text: "Option B" },
  ];

  it("should render all choices", () => {
    render(<ChoiceGrid choices={choices} />);
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
  });

  it("should call onSelect when a choice is clicked", () => {
    const onSelect = vi.fn();
    render(<ChoiceGrid choices={choices} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Option A"));
    expect(onSelect).toHaveBeenCalledWith("A");
  });

  it("should apply correct styles for selected choice", () => {
    render(<ChoiceGrid choices={choices} selected="A" />);
    const button = screen.getByText("Option A").closest("button");
    expect(button).toHaveClass("border-indigo-500");
  });

  it("should show correct/incorrect styles in review mode", () => {
    render(
      <ChoiceGrid
        choices={choices}
        selected="A"
        correct="B"
        reviewMode={true}
      />
    );

    const optionA = screen.getByText("Option A").closest("button");
    const optionB = screen.getByText("Option B").closest("button");

    expect(optionA).toHaveClass("border-red-400"); // Selected but wrong
    expect(optionB).toHaveClass("border-green-400"); // Correct
  });
});
