import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RevisionAsk } from "./RevisionAsk";
import * as revisionAsk from "../../lib/revisionAsk";

function renderAsk(docId = "m1/units") {
  // The real parent keys RevisionAsk by docId so a new topic remounts it with
  // fresh state; mirror that here so the reset behaviour is exercised faithfully.
  return render(<RevisionAsk key={docId} moduleSlug="m1" topicSlug="units" />);
}

describe("RevisionAsk", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is closed by default and opens the drawer on click", () => {
    renderAsk();

    expect(screen.queryByPlaceholderText("Ask about this page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask ai/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(screen.getByText("What can I help you with?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask ai/i })).not.toBeInTheDocument();
  });

  it("submits a suggestion prompt and renders the answer", async () => {
    vi.spyOn(revisionAsk, "askRevisionQuestion").mockResolvedValue("Use SI units for standard problems.");

    renderAsk();
    fireEvent.click(screen.getByRole("button", { name: /ask ai/i }));
    fireEvent.click(screen.getByRole("button", { name: /summarise this page/i }));

    expect(await screen.findByText("Summarise this page")).toBeInTheDocument();
    expect(await screen.findByText("Use SI units for standard problems.")).toBeInTheDocument();
    expect(revisionAsk.askRevisionQuestion).toHaveBeenCalledWith("m1", "units", "Summarise this page", []);
  });

  it("submits a typed question via the form", async () => {
    vi.spyOn(revisionAsk, "askRevisionQuestion").mockResolvedValue("An answer.");

    renderAsk();
    fireEvent.click(screen.getByRole("button", { name: /ask ai/i }));

    fireEvent.change(screen.getByPlaceholderText("Ask about this page"), { target: { value: "Why base SI units?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Why base SI units?")).toBeInTheDocument();
    expect(await screen.findByText("An answer.")).toBeInTheDocument();
  });

  it("shows an error and removes the pending turn on failure", async () => {
    vi.spyOn(revisionAsk, "askRevisionQuestion").mockRejectedValue(new Error("Too many requests"));

    renderAsk();
    fireEvent.click(screen.getByRole("button", { name: /ask ai/i }));

    fireEvent.change(screen.getByPlaceholderText("Ask about this page"), { target: { value: "What is a unit?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("What is a unit?")).not.toBeInTheDocument());
  });

  it("resets and closes the drawer when the doc changes", async () => {
    vi.spyOn(revisionAsk, "askRevisionQuestion").mockResolvedValue("An answer.");

    const { rerender } = renderAsk("m1/units");
    fireEvent.click(screen.getByRole("button", { name: /ask ai/i }));
    fireEvent.change(screen.getByPlaceholderText("Ask about this page"), { target: { value: "Q1" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("An answer.");

    rerender(<RevisionAsk key="m1/algebra" moduleSlug="m1" topicSlug="algebra" />);
    expect(screen.queryByText("Q1")).not.toBeInTheDocument();
    expect(screen.queryByText("An answer.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask ai/i })).toBeInTheDocument();
  });
});
