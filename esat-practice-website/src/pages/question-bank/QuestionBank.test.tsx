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

  it("drills the expanded question's topic into a topic session", async () => {
    renderQuestionBank();

    fireEvent.click(screen.getByText(/Algebra expansion practice/).closest("button") as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Drill this topic" }));

    await waitFor(() => {
      expect(storeMocks.sessionState.createSession).toHaveBeenCalledWith({
        mode: "topic",
        question_ids: ["q1"],
        topic_filter: ["Algebra"],
        question_count: 1,
      });
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/session/session-1");
  });

  it("filters by topic chips, year chips, primary-model toggle, and sort order", () => {
    renderQuestionBank();

    // Topic chip narrows to Algebra.
    fireEvent.click(screen.getByRole("button", { name: "Algebra" }));
    expect(screen.getByText(/Algebra expansion practice/)).toBeInTheDocument();
    expect(screen.queryByText(/Mechanics velocity practice/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Algebra" }));

    // Year chip narrows to 2021.
    fireEvent.click(screen.getByRole("button", { name: "2021" }));
    expect(screen.getByText(/Mechanics velocity practice/)).toBeInTheDocument();
    expect(screen.queryByText(/Algebra expansion practice/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2021" }));

    // Primary-model only hides the escalated question (q2).
    fireEvent.click(screen.getByLabelText("Primary-model only"));
    expect(screen.queryByText(/Mechanics velocity practice/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Primary-model only"));

    // Sorting by topic puts Algebra before Mechanics.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "topic" } });
    const previews = screen
      .getAllByText(/practice$/)
      .map((node) => node.textContent);
    expect(previews[0]).toContain("Algebra expansion");
  });

  it("reports hidden NSAA duplicates and can un-hide them", () => {
    const twin = makeQuestion("nsaa1", "Algebra expansion practice", "Algebra", 2020);
    storeMocks.questionState.fullPracticeBank = [...practiceQuestions, twin];
    storeMocks.questionState.allQuestions = [...practiceQuestions, twin, ...excludedQuestions];
    storeMocks.questionState.nsaaDuplicateAnalysis = {
      hiddenNsaaIds: new Set(["nsaa1"]),
      excludedPairs: [],
      nearMissPairs: [],
    };

    renderQuestionBank();
    expect(screen.getByText(/\(1 NSAA duplicates hidden\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Exclude NSAA duplicates"));
    expect(screen.queryByText(/NSAA duplicates hidden/)).not.toBeInTheDocument();
    expect(screen.getByText(/3 of 3 practice questions/)).toBeInTheDocument();
  });

  it("opens the data dump panel and shows aggregate stats", () => {
    const { container } = renderQuestionBank();

    const details = container.querySelector("details.sk-bank-datadump") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    expect(screen.getByText("Total questions")).toBeInTheDocument();
    expect(screen.getByText("Primary topic counts")).toBeInTheDocument();
    expect(screen.getByText("Year counts")).toBeInTheDocument();
  });

  it("shows the dedupe debug panel with excluded pairs and near misses", () => {
    const nsaaTwin = makeQuestion("nsaa1", "Shared duplicate text", "Algebra", 2020);
    const engaaTwin = makeQuestion("q1", "Shared duplicate text", "Algebra", 2020);
    storeMocks.questionState.nsaaDuplicateAnalysis = {
      hiddenNsaaIds: new Set(["nsaa1"]),
      excludedPairs: [
        {
          nsaaQuestion: nsaaTwin,
          engaaQuestion: engaaTwin,
          similarity: 0.97,
          textLengthRatio: 0.99,
          year: 2020,
          partKey: "1A",
        },
      ],
      nearMissPairs: [
        {
          nsaaQuestion: makeQuestion("nsaa2", "Nearly the same text", "Algebra", 2021),
          engaaQuestion: makeQuestion("q2", "Nearly identical text", "Algebra", 2021),
          similarity: 0.82,
          textLengthRatio: 0.95,
          year: 2021,
          partKey: "1A",
          reason: "similarity_below_threshold",
        },
      ],
    };

    renderQuestionBank();
    fireEvent.click(screen.getByLabelText("Dedupe debug"));

    expect(screen.getByText("1 excluded")).toBeInTheDocument();
    expect(screen.getByText("1 near miss")).toBeInTheDocument();
    expect(screen.getByText("score 97% | length ratio 99%")).toBeInTheDocument();
    expect(
      screen.getByText("Reason: similarity below exclusion threshold"),
    ).toBeInTheDocument();
  });

  it("excluded-scope detail panel offers undo instead of exclude and renders the scan", async () => {
    storeMocks.questionState.excludedQuestions = [
      {
        ...excludedQuestions[0],
        content: { ...excludedQuestions[0].content, image_b64: "abc123" },
      },
    ];

    renderQuestionBank();
    fireEvent.click(screen.getByRole("tab", { name: "Excluded (1)" }));
    fireEvent.click(
      screen.getByText(/Excluded calculus practice/).closest("button") as HTMLElement,
    );

    // Drill is blocked while excluded; the danger action flips to undo.
    const drill = await screen.findByRole("button", { name: "Undo exclusion to drill" });
    expect(drill).toBeDisabled();
    expect(screen.getByAltText("Diagram")).toHaveAttribute(
      "src",
      "data:image/png;base64,abc123",
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo exclusion" }));
    expect(storeMocks.excludedState.includeQuestion).toHaveBeenCalledWith(
      "ex1",
      storeMocks.questionState.allQuestions,
    );
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
