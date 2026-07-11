import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import QuestionBank from ".";
import type { NsaaDuplicateAnalysis } from "../../lib/questionDedup";
import type { Question } from "../../types/schema";

const storeMocks = vi.hoisted(() => ({
  questionState: {
    allQuestions: [] as Question[],
    fullPracticeBank: [] as Question[],
    excludedQuestions: [] as Question[],
    excludedQuestionIds: new Set<string>(),
    availableTopics: [] as string[],
    availableYears: [] as number[],
    isLoading: false,
    loaded: true,
    nsaaDuplicateAnalysis: {
      hiddenNsaaIds: new Set<string>(),
      excludedPairs: [],
      nearMissPairs: [],
    } as NsaaDuplicateAnalysis,
  },
  sessionState: {
    createSession: vi.fn(),
  },
  excludedState: {
    excludeQuestion: vi.fn(),
    includeQuestion: vi.fn(),
  },
}));

vi.mock("../../lib/questionStore", () => ({
  useQuestionStore: () => storeMocks.questionState,
}));

vi.mock("../../lib/sessionStore", () => ({
  useSessionStore: () => storeMocks.sessionState,
}));

vi.mock("../../lib/excludedQuestionStore", () => ({
  useExcludedQuestionStore: () => storeMocks.excludedState,
}));

function makeQuestion(
  id: string,
  text: string,
  topic: string,
  year: number,
  verified = true,
): Question {
  return {
    id,
    source: { paper: "ENGAA", year, part: "1A", subject: "Math", page: 1 },
    content: { text },
    answer: { correct: "A", verified },
    taxonomy: {
      primary_topic: topic,
      secondary_topics: [],
      confidence: 1,
      model_used: verified ? "primary" : "escalated",
    },
    meta: { times_attempted: 0, accuracy_rate: 0.5 },
  };
}

const practiceQuestions = [
  makeQuestion("q1", "Algebra expansion practice", "Algebra", 2020),
  makeQuestion("q2", "Mechanics velocity practice", "Mechanics", 2021, false),
];

const excludedQuestions = [
  makeQuestion("ex1", "Excluded calculus practice", "Calculus", 2019),
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderQuestionBank(path = "/question-bank") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/question-bank"
          element={
            <>
              <QuestionBank />
              <LocationProbe />
            </>
          }
        />
        <Route path="/session/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("QuestionBank", () => {
  beforeEach(() => {
    storeMocks.questionState.allQuestions = [
      ...practiceQuestions,
      ...excludedQuestions,
    ];
    storeMocks.questionState.fullPracticeBank = practiceQuestions;
    storeMocks.questionState.excludedQuestions = excludedQuestions;
    storeMocks.questionState.excludedQuestionIds = new Set(["ex1"]);
    storeMocks.questionState.availableTopics = ["Algebra", "Mechanics", "Calculus"];
    storeMocks.questionState.availableYears = [2019, 2020, 2021];
    storeMocks.questionState.isLoading = false;
    storeMocks.questionState.loaded = true;
    storeMocks.questionState.nsaaDuplicateAnalysis = {
      hiddenNsaaIds: new Set(),
      excludedPairs: [],
      nearMissPairs: [],
    };
    storeMocks.sessionState.createSession.mockResolvedValue({ id: "session-1" });
    storeMocks.excludedState.excludeQuestion.mockResolvedValue(undefined);
    storeMocks.excludedState.includeQuestion.mockResolvedValue(undefined);
    storeMocks.sessionState.createSession.mockClear();
    storeMocks.excludedState.excludeQuestion.mockClear();
    storeMocks.excludedState.includeQuestion.mockClear();
  });

  it("renders loading and empty states", () => {
    storeMocks.questionState.loaded = false;
    storeMocks.questionState.isLoading = true;
    storeMocks.questionState.allQuestions = [];
    storeMocks.questionState.fullPracticeBank = [];
    storeMocks.questionState.excludedQuestions = [];

    const { rerender } = renderQuestionBank();

    expect(screen.getAllByText("Preparing question bank...")).toHaveLength(2);

    storeMocks.questionState.loaded = true;
    storeMocks.questionState.isLoading = false;
    rerender(
      <MemoryRouter initialEntries={["/question-bank"]}>
        <Routes>
          <Route path="/question-bank" element={<QuestionBank />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("No questions match your filters.")).toBeInTheDocument();
  });

  it("filters, expands, excludes/restores, and starts a filtered practice session", async () => {
    renderQuestionBank();

    fireEvent.change(screen.getByLabelText("Search questions"), {
      target: { value: "algebra" },
    });

    expect(screen.getByText(/Algebra expansion practice/)).toBeInTheDocument();
    expect(screen.queryByText(/Mechanics velocity practice/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Algebra expansion practice/).closest("button") as HTMLElement);
    expect(await screen.findByText("Drill this topic")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    expect(storeMocks.excludedState.excludeQuestion).toHaveBeenCalledWith(
      "q1",
      storeMocks.questionState.allQuestions,
    );

    fireEvent.click(screen.getByRole("button", { name: "Practice these (1)" }));
    await waitFor(() => {
      expect(storeMocks.sessionState.createSession).toHaveBeenCalledWith({
        mode: "mixed",
        question_ids: ["q1"],
        question_count: 1,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/session/session-1");
    });

    renderQuestionBank();
    fireEvent.click(screen.getByRole("tab", { name: "Excluded (1)" }));
    expect(await screen.findByText(/Excluded calculus practice/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(storeMocks.excludedState.includeQuestion).toHaveBeenCalledWith(
      "ex1",
      storeMocks.questionState.allQuestions,
    );
  });
});
