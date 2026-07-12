import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RevisionConfidence } from "./RevisionConfidence";
import { useRevisionProgress } from "../../store/revisionProgress";

beforeEach(() => {
  localStorage.clear();
  useRevisionProgress.getState().reset();
});

describe("RevisionConfidence", () => {
  it("renders three buttons, all unpressed initially", () => {
    render(<RevisionConfidence docId="m1/units" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    buttons.forEach((btn) => expect(btn).toHaveAttribute("aria-pressed", "false"));
  });

  it("sets confidence when a level is clicked", () => {
    render(<RevisionConfidence docId="m1/units" />);
    fireEvent.click(screen.getByRole("button", { name: /solid/i }));
    expect(useRevisionProgress.getState().topics["m1/units"].confidence).toBe("solid");
    expect(screen.getByRole("button", { name: /solid/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clears confidence when the active level is clicked again", () => {
    render(<RevisionConfidence docId="m1/units" />);
    const shaky = screen.getByRole("button", { name: /shaky/i });
    fireEvent.click(shaky);
    expect(useRevisionProgress.getState().topics["m1/units"].confidence).toBe("shaky");
    fireEvent.click(shaky);
    expect(useRevisionProgress.getState().topics["m1/units"].confidence).toBeNull();
    expect(shaky).toHaveAttribute("aria-pressed", "false");
  });
});
