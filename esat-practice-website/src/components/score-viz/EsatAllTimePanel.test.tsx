import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { TopicStat } from "../../types/schema";
import { EsatAllTimePanel } from "./EsatAllTimePanel";

function stat(topic: string, attempts: number, correct: number): TopicStat {
  return {
    topic,
    attempts,
    correct,
    accuracy: attempts > 0 ? correct / attempts : 0,
    ewma_accuracy: attempts > 0 ? correct / attempts : 0,
    last_attempted: 1_700_000_000_000,
  };
}

function renderPanel(stats: TopicStat[]) {
  return render(
    <MemoryRouter>
      <EsatAllTimePanel stats={stats} />
    </MemoryRouter>,
  );
}

describe("EsatAllTimePanel", () => {
  it("groups topic stats into ESAT modules and skips unclassified topics", () => {
    renderPanel([
      stat("M01 Algebra", 3, 2),
      stat("M02 Functions", 2, 1),
      stat("MM01 Advanced algebra", 4, 3),
      stat("P01 Forces", 5, 4),
      stat("Logic", 20, 20),
    ]);

    expect(screen.getByText("ESAT scaled score estimate")).toBeInTheDocument();
    expect(screen.getByText("Mathematics 1")).toBeInTheDocument();
    expect(screen.getByText("Mathematics 2")).toBeInTheDocument();
    expect(screen.getByText("Physics")).toBeInTheDocument();
    expect(screen.queryByText("Logic")).not.toBeInTheDocument();

    const maths1 = screen.getByText("Mathematics 1").closest(".sv-card");
    expect(maths1).not.toBeNull();
    expect(within(maths1 as HTMLElement).getByText("~16/27 raw")).toBeInTheDocument();
  });

  it("renders all-time module display and score-reference link", () => {
    renderPanel([stat("C01 Atomic structure", 3, 2)]);

    expect(screen.getByText(/All-time.*across all sessions/)).toBeInTheDocument();
    expect(screen.getByText("Chemistry")).toBeInTheDocument();
    expect(screen.getByText("estimated")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "How is this calculated?" }),
    ).toHaveAttribute("href", "/score-reference");
  });

  it("renders nothing when no topic stat maps to an ESAT module", () => {
    const { container } = renderPanel([stat("Logic", 10, 9)]);

    expect(container).toBeEmptyDOMElement();
  });
});
