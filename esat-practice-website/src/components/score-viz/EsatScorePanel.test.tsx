import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Attempt, Question } from "../../types/schema";
import { EsatScorePanel, type ReviewItem } from "./EsatScorePanel";

vi.mock("./AccuracyHistoryChart", () => ({
  AccuracyHistoryChart: ({ currentAccuracy }: { currentAccuracy: number }) => (
    <div data-testid="history-chart">Current accuracy {currentAccuracy}</div>
  ),
}));

function makeQuestion(id: string, topic: string): Question {
  return {
    id,
    source: {
      paper: "ENGAA",
      year: 2024,
      part: "1A",
      subject: "Test",
      page: 1,
    },
    content: { text: `${topic} question` },
    answer: { correct: "A", verified: true },
    taxonomy: {
      primary_topic: topic,
      secondary_topics: [],
      confidence: 1,
      model_used: "test",
    },
    meta: { times_attempted: 0, accuracy_rate: 0 },
  };
}

function makeAttempt(
  id: string,
  questionId: string,
  result: Attempt["result"],
): Attempt {
  return {
    id,
    question_id: questionId,
    session_id: "session",
    result,
    time_ms: 10_000,
    flagged: false,
    timestamp: 1_700_000_000_000,
  };
}

function item(id: string, topic: string, result: Attempt["result"]): ReviewItem {
  return {
    question: makeQuestion(id, topic),
    attempt: makeAttempt(`a-${id}`, id, result),
  };
}

describe("EsatScorePanel", () => {
  it("counts skipped module attempts as zero-scored attempts", () => {
    render(
      <EsatScorePanel
        items={[
          item("q1", "M01 Algebra", "skipped"),
          item("q2", "M01 Algebra", "correct"),
        ]}
      />,
    );

    const mathsCard = screen.getAllByText("Mathematics 1")[0].closest(".sv-card");
    expect(mathsCard).not.toBeNull();
    expect(within(mathsCard as HTMLElement).getByText("~14/27 raw")).toBeInTheDocument();
    const breakdown = screen.getByText("Topic breakdown").closest(".sv-breakdown");
    expect(breakdown).not.toBeNull();
    expect(breakdown as HTMLElement).toHaveTextContent("M01 Algebra");
    expect(breakdown as HTMLElement).toHaveTextContent("1/2 (50%)");
    expect(screen.getByTestId("history-chart")).toHaveTextContent(
      "Current accuracy 1",
    );
  });

  it("ignores unclassified topics when deciding which modules to render", () => {
    const { container } = render(
      <EsatScorePanel
        items={[
          item("q1", "Logic", "correct"),
          item("q2", "", "incorrect"),
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows estimated badges for Chemistry and Biology extrapolated modules", () => {
    render(
      <EsatScorePanel
        items={[
          item("q1", "C01 Atomic structure", "correct"),
          item("q2", "B01 Cells", "incorrect"),
        ]}
      />,
    );

    expect(screen.getAllByText("Chemistry").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Biology").length).toBeGreaterThan(0);
    expect(screen.getAllByText("estimated")).toHaveLength(2);
  });

  it("renders nothing for an empty attempt list", () => {
    const { container } = render(<EsatScorePanel items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
