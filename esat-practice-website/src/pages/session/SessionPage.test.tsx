import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import SessionPage from ".";
import { useSettingsStore } from "../../lib/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";
import type { Attempt, Question, Session } from "../../types/schema";

const mocks = vi.hoisted(() => ({
  engine: {} as Record<string, unknown>,
  allQuestions: [] as Question[],
  mark: vi.fn(),
  flag: vi.fn(),
  skip: vi.fn(),
  excludeCurrentQuestion: vi.fn(),
  nav: vi.fn(),
  jumpTo: vi.fn(),
  submit: vi.fn(),
  quit: vi.fn(),
  pause: vi.fn(),
}));

vi.mock("../../store/sessionSlice", () => ({
  useSessionEngine: () => mocks.engine,
}));

vi.mock("../../lib/questionStore", () => ({
  useQuestionStore: () => ({ allQuestions: mocks.allQuestions }),
}));

vi.mock("../../components/question/ZoomableImage", () => ({
  ZoomableImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

vi.mock("../../components/AskClaudeButton", () => ({
  AskClaudeButton: () => <button type="button">Ask Claude</button>,
}));

function makeQuestion(id: string, answer: string): Question {
  return {
    id,
    source: {
      paper: "ENGAA 2022",
      year: 2022,
      part: "1A",
      subject: "Math",
      page: Number(id.slice(1)),
    },
    content: {
      text: `Rendered question text for ${id}`,
      image_url: `/question-images/${id}.webp`,
    },
    answer: { correct: answer, verified: true },
    taxonomy: {
      primary_topic: "Algebra",
      secondary_topics: [],
      confidence: 0.94,
      model_used: "test",
    },
    meta: { times_attempted: 0, accuracy_rate: 0 },
  };
}

const questions = [
  makeQuestion("q1", "A"),
  makeQuestion("q2", "B"),
  makeQuestion("q3", "C"),
];

function makeSession(mode: Session["mode"] = "untimed"): Session {
  return {
    id: "session-1",
    created_at: 1,
    mode,
    state: "active",
    attempt_ids: [],
    config: {
      question_ids: questions.map((question) => question.id),
      question_count: questions.length,
      ...(mode === "timed" ? { time_limit_ms: 180_000 } : {}),
    },
  };
}

function setEngine(overrides: Record<string, unknown> = {}) {
  const currentIndex = (overrides.currentIndex as number | undefined) ?? 0;
  const currentQuestion =
    overrides.currentQuestion === undefined
      ? questions[currentIndex]
      : overrides.currentQuestion;

  mocks.engine = {
    notFound: false,
    status: "active",
    session: makeSession(),
    currentQuestion,
    currentIndex,
    totalCount: questions.length,
    timeRemaining: undefined,
    currentAttemptResult: undefined,
    isFlagged: false,
    mark: mocks.mark,
    flag: mocks.flag,
    skip: mocks.skip,
    excludeCurrentQuestion: mocks.excludeCurrentQuestion,
    nav: mocks.nav,
    jumpTo: mocks.jumpTo,
    submit: mocks.submit,
    quit: mocks.quit,
    pause: mocks.pause,
    responses: {},
    questions,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderSession(path = "/session/session-1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/session/:id"
          element={
            <>
              <SessionPage />
              <LocationProbe />
            </>
          }
        />
        <Route path="/results/:id" element={<LocationProbe />} />
        <Route path="/" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SessionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allQuestions = questions;
    for (const action of [
      mocks.mark,
      mocks.flag,
      mocks.skip,
      mocks.excludeCurrentQuestion,
      mocks.nav,
      mocks.jumpTo,
      mocks.submit,
      mocks.quit,
      mocks.pause,
    ]) {
      action.mockResolvedValue(undefined);
    }
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        examMode: false,
        autoAdvance: false,
        fullscreenOnStart: false,
      },
    });
    setEngine();
  });

  it("renders the active question scan and supports reveal plus self-marking", () => {
    renderSession();

    expect(screen.getByText("Rendered question text for q1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Question source scan" })).toHaveAttribute(
      "src",
      "/question-images/q1.webp",
    );
    expect(screen.queryByText("Correct answer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reveal answer/i }));

    expect(screen.getAllByText("Correct answer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
    expect(screen.getByText("Algebra (94% confidence)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Claude" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Correct/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Incorrect/i })[0]);

    expect(mocks.mark).toHaveBeenNthCalledWith(1, "correct");
    expect(mocks.mark).toHaveBeenNthCalledWith(2, "incorrect");
  });

  it("wires flag, skip, exclude, previous, next, and jump navigation", () => {
    setEngine({ currentIndex: 1, currentQuestion: questions[1] });
    renderSession();

    fireEvent.click(screen.getByRole("button", { name: "Flag question" }));
    fireEvent.keyDown(document, { key: "s" });
    fireEvent.click(screen.getAllByRole("button", { name: "Exclude" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Prev/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    fireEvent.click(screen.getByRole("button", { name: "Go to question 3" }));

    expect(mocks.flag).toHaveBeenCalledOnce();
    expect(mocks.skip).toHaveBeenCalledOnce();
    expect(mocks.excludeCurrentQuestion).toHaveBeenCalledWith(questions);
    expect(mocks.nav).toHaveBeenNthCalledWith(1, "prev");
    expect(mocks.nav).toHaveBeenNthCalledWith(2, "next");
    expect(mocks.jumpTo).toHaveBeenCalledWith(2);
  });

  it("submits the final answered question and redirects once completed", async () => {
    const attempt: Attempt = {
      id: "attempt-3",
      question_id: "q3",
      session_id: "session-1",
      result: "correct",
      time_ms: 1000,
      flagged: false,
      timestamp: 2,
    };
    setEngine({
      currentIndex: 2,
      currentQuestion: questions[2],
      currentAttemptResult: "correct",
      responses: { q3: attempt },
    });
    const view = renderSession();

    fireEvent.click(screen.getByRole("button", { name: "Submit session" }));
    expect(mocks.submit).toHaveBeenCalledOnce();

    setEngine({
      status: "completed",
      session: { ...makeSession(), state: "completed" },
      currentIndex: 2,
      currentQuestion: questions[2],
      currentAttemptResult: "correct",
      responses: { q3: attempt },
    });
    view.rerender(
      <MemoryRouter initialEntries={["/session/session-1"]}>
        <Routes>
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/results/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/results/session-1",
      );
    });
  });

  it("shows loading while the engine hydrates and redirects unknown sessions", async () => {
    setEngine({ status: "idle", session: null, currentQuestion: null, questions: [] });
    const view = renderSession();
    expect(screen.getByText("Loading session...")).toBeInTheDocument();

    setEngine({
      notFound: true,
      status: "idle",
      session: null,
      currentQuestion: null,
      questions: [],
    });
    view.rerender(
      <MemoryRouter initialEntries={["/session/missing"]}>
        <Routes>
          <Route
            path="/session/:id"
            element={
              <>
                <SessionPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/");
    });
  });

  it("renders timed review state and redirects after timeout completion", async () => {
    setEngine({
      status: "reviewing",
      session: makeSession("timed"),
      timeRemaining: 0,
    });
    const view = renderSession();

    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("Rendered question text for q1")).toBeInTheDocument();

    setEngine({
      status: "completed",
      session: { ...makeSession("timed"), state: "completed" },
      timeRemaining: 0,
    });
    view.rerender(
      <MemoryRouter initialEntries={["/session/session-1"]}>
        <Routes>
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/results/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/results/session-1",
      );
    });
  });
});
