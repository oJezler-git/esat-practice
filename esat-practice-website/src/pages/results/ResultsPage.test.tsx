import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ResultsPage from ".";
import { useSettingsStore } from "../../lib/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";
import type { Attempt, Question, Session } from "../../types/schema";

const storeMocks = vi.hoisted(() => ({
  sessionState: {
    getSession: vi.fn(),
    getAttempts: vi.fn(),
  },
  questionState: {
    getQuestionsByIds: vi.fn(),
    allQuestions: [] as Question[],
  },
  excludedState: {
    excludeQuestion: vi.fn(),
  },
}));

vi.mock("../../lib/sessionStore", () => ({
  useSessionStore: () => storeMocks.sessionState,
}));

vi.mock("../../lib/questionStore", () => ({
  useQuestionStore: () => storeMocks.questionState,
}));

vi.mock("../../lib/excludedQuestionStore", () => ({
  useExcludedQuestionStore: () => storeMocks.excludedState,
}));

vi.mock("../../components/score-viz/EsatScorePanel", () => ({
  EsatScorePanel: ({ items }: { items: unknown[] }) => (
    <div data-testid="score-panel">Score panel received {items.length} items</div>
  ),
}));

function makeQuestion(
  id: string,
  text: string,
  topic: string,
  page: number,
): Question {
  return {
    id,
    source: {
      paper: "ENGAA 2021",
      year: 2021,
      part: "1A",
      subject: "Math",
      page,
    },
    content: { text },
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

const questions = [
  makeQuestion("q1", "Differentiate x squared.", "Algebra", 1),
  makeQuestion("q2", "Find the velocity after two seconds.", "Mechanics", 2),
  makeQuestion("q3", "Estimate the area under the graph.", "Calculus", 3),
];

const completedSession: Session = {
  id: "completed-session",
  created_at: 1_700_000_000_000,
  completed_at: 1_700_000_600_000,
  mode: "untimed",
  state: "completed",
  attempt_ids: ["a1", "a2"],
  config: {
    question_ids: ["q1", "q2", "q3"],
    question_count: 3,
  },
};

const attempts: Attempt[] = [
  {
    id: "a1",
    question_id: "q1",
    session_id: "completed-session",
    result: "correct",
    time_ms: 12_000,
    flagged: false,
    timestamp: 1_700_000_100_000,
  },
  {
    id: "a2",
    question_id: "q2",
    session_id: "completed-session",
    result: "incorrect",
    time_ms: 30_000,
    flagged: true,
    timestamp: 1_700_000_200_000,
  },
];

function renderResultsPage() {
  return render(
    <MemoryRouter initialEntries={["/results/completed-session"]}>
      <Routes>
        <Route path="/results/:id" element={<ResultsPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResultsPage", () => {
  beforeEach(() => {
    storeMocks.sessionState.getSession.mockResolvedValue(completedSession);
    storeMocks.sessionState.getAttempts.mockResolvedValue(attempts);
    storeMocks.questionState.getQuestionsByIds.mockResolvedValue(questions);
    storeMocks.questionState.allQuestions = questions;
    storeMocks.excludedState.excludeQuestion.mockResolvedValue(undefined);
    storeMocks.sessionState.getSession.mockClear();
    storeMocks.sessionState.getAttempts.mockClear();
    storeMocks.questionState.getQuestionsByIds.mockClear();
    storeMocks.excludedState.excludeQuestion.mockClear();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        autoExclude: false,
      },
    });
  });

  it("renders scored attempts for a completed session, including skipped fallbacks", async () => {
    renderResultsPage();

    expect(await screen.findByTestId("score-panel")).toHaveTextContent(
      "Score panel received 3 items",
    );

    expect(screen.getByText(/Differentiate x squared\./)).toBeInTheDocument();
    expect(screen.getByText(/Find the velocity after two seconds\./)).toBeInTheDocument();
    expect(screen.getByText(/Estimate the area under the graph\./)).toBeInTheDocument();
    expect(screen.getByText("correct")).toBeInTheDocument();
    expect(screen.getByText("incorrect")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(storeMocks.questionState.getQuestionsByIds).toHaveBeenCalledWith([
      "q1",
      "q2",
      "q3",
    ]);
  });

  it("filters the review list to incorrect attempts only", async () => {
    renderResultsPage();

    await screen.findByText(/Find the velocity after two seconds\./);

    fireEvent.click(screen.getByRole("button", { name: "Incorrect only" }));

    expect(screen.getByText(/Find the velocity after two seconds\./)).toBeInTheDocument();
    expect(screen.getByText("incorrect")).toBeInTheDocument();
    expect(screen.queryByText(/differentiate x squared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/estimate the area/i)).not.toBeInTheDocument();
  });

  it("expands a review row to show question details and verdict", async () => {
    renderResultsPage();

    const incorrectText = await screen.findByText(/Find the velocity after two seconds\./);
    const incorrectRow = incorrectText.closest("button") as HTMLButtonElement;
    fireEvent.click(incorrectRow);

    await waitFor(() => {
      expect(incorrectRow).toHaveAttribute("aria-expanded", "true");
    });

    const item = incorrectRow.closest(".sk-results-item");
    expect(item).not.toBeNull();
    expect(
      within(item as HTMLElement).getByText("Self-marked incorrect"),
    ).toBeInTheDocument();
    expect(within(item as HTMLElement).getByText("Answer:")).toBeInTheDocument();
    expect(within(item as HTMLElement).getAllByText("Mechanics")).toHaveLength(2);
    expect(within(item as HTMLElement).getByText("30s")).toBeInTheDocument();
  });
});
