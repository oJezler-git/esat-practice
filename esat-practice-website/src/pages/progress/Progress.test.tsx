import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Progress from ".";
import type {
  CategoryStat,
  Question,
  Session,
  SessionSummary,
  TopicStat,
} from "../../types/schema";

const storeMocks = vi.hoisted(() => ({
  statsState: {
    getAllStats: vi.fn(),
    getCategoryStats: vi.fn(),
    getSessionSummaries: vi.fn(),
  },
  sessionState: {
    getRecentSessions: vi.fn(),
    createSession: vi.fn(),
  },
  questionState: {
    allQuestions: [] as Question[],
  },
}));

vi.mock("../../lib/statsStore", () => ({
  useStatsStore: () => storeMocks.statsState,
}));

vi.mock("../../lib/sessionStore", () => ({
  useSessionStore: () => storeMocks.sessionState,
}));

vi.mock("../../lib/questionStore", () => ({
  useQuestionStore: () => storeMocks.questionState,
}));

function topic(topicName: string, attempts: number, correct: number, ewma = correct / attempts): TopicStat {
  return {
    topic: topicName,
    attempts,
    correct,
    accuracy: attempts > 0 ? correct / attempts : 0,
    ewma_accuracy: ewma,
    last_attempted: 1_700_000_000_000,
  };
}

function category(overrides: Partial<CategoryStat>): CategoryStat {
  return {
    id: `${overrides.dimension ?? "program"}::${overrides.key ?? "ENGAA"}`,
    dimension: overrides.dimension ?? "program",
    key: overrides.key ?? "ENGAA",
    attempts: overrides.attempts ?? 5,
    correct: overrides.correct ?? 3,
    accuracy: overrides.accuracy ?? 0.6,
    ewma_accuracy: overrides.ewma_accuracy ?? 0.6,
    last_attempted: 1_700_000_000_000,
    total_time_ms: overrides.total_time_ms ?? 100_000,
    timed_attempts: overrides.timed_attempts ?? 5,
    avg_time_ms: overrides.avg_time_ms ?? 20_000,
    median_time_ms: overrides.median_time_ms ?? 18_000,
    program: overrides.program,
    ...overrides,
  };
}

function question(id: string, primaryTopic: string): Question {
  return {
    id,
    source: {
      paper: "ENGAA",
      year: 2024,
      part: "1A",
      subject: "Test",
      page: 1,
    },
    content: { text: `${primaryTopic} question` },
    answer: { correct: "A", verified: true },
    taxonomy: {
      primary_topic: primaryTopic,
      secondary_topics: [],
      confidence: 1,
      model_used: "test",
    },
    meta: { times_attempted: 0, accuracy_rate: 0 },
  };
}

function session(overrides: Partial<Session>): Session {
  return {
    id: "completed-session",
    created_at: 1_700_000_000_000,
    completed_at: 1_700_000_600_000,
    mode: "untimed",
    config: { question_ids: ["q1", "q2"], question_count: 2 },
    attempt_ids: ["a1", "a2"],
    state: "completed",
    ...overrides,
  };
}

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: "completed-session",
    mode: "untimed",
    completed_at: 1_700_000_600_000,
    attempts: 5,
    correct: 3,
    skipped: 0,
    accuracy: 0.6,
    total_time_ms: 120_000,
    avg_time_ms: 24_000,
    median_time_ms: 20_000,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderProgress() {
  return render(
    <MemoryRouter initialEntries={["/progress"]}>
      <Routes>
        <Route
          path="/progress"
          element={
            <>
              <Progress />
              <LocationProbe />
            </>
          }
        />
        <Route path="/session/:id" element={<LocationProbe />} />
        <Route path="/results/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Progress", () => {
  beforeEach(() => {
    storeMocks.statsState.getAllStats.mockResolvedValue([]);
    storeMocks.statsState.getCategoryStats.mockResolvedValue([]);
    storeMocks.statsState.getSessionSummaries.mockResolvedValue([]);
    storeMocks.sessionState.getRecentSessions.mockResolvedValue([]);
    storeMocks.sessionState.createSession.mockResolvedValue(
      session({ id: "weak-drill", state: "active", completed_at: undefined }),
    );
    storeMocks.questionState.allQuestions = [];
    storeMocks.statsState.getAllStats.mockClear();
    storeMocks.statsState.getCategoryStats.mockClear();
    storeMocks.statsState.getSessionSummaries.mockClear();
    storeMocks.sessionState.getRecentSessions.mockClear();
    storeMocks.sessionState.createSession.mockClear();
  });

  it("renders the empty state when there are no attempts", async () => {
    renderProgress();

    expect(
      await screen.findByText("No attempts yet. Complete a session to see your progress."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Overall accuracy")).not.toBeInTheDocument();
  });

  it("renders all-time score panel and category breakdown toggle", async () => {
    storeMocks.statsState.getAllStats.mockResolvedValue([
      topic("M01 Algebra", 5, 3),
      topic("P01 Forces", 4, 3),
    ]);
    storeMocks.statsState.getCategoryStats.mockResolvedValue([
      category({ dimension: "program", key: "ENGAA", attempts: 5, correct: 3 }),
      category({ dimension: "subject", key: "Physics", attempts: 4, correct: 3 }),
    ]);
    storeMocks.statsState.getSessionSummaries.mockResolvedValue([summary()]);

    renderProgress();

    expect(await screen.findByText("ESAT scaled score estimate")).toBeInTheDocument();
    expect(screen.getByText("Mathematics 1")).toBeInTheDocument();
    expect(screen.getAllByText("Physics").length).toBeGreaterThan(0);
    expect(screen.getByText("ENGAA")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Subject" }));

    const breakdown = screen.getByText("Breakdown").closest("section");
    expect(breakdown).not.toBeNull();
    await waitFor(() => {
      expect(within(breakdown as HTMLElement).getByText("Physics")).toBeInTheDocument();
      expect(within(breakdown as HTMLElement).queryByText("ENGAA")).not.toBeInTheDocument();
    });
  });

  it("creates a weak-topic drill session from matching question topics", async () => {
    storeMocks.statsState.getAllStats.mockResolvedValue([
      topic("M01 Algebra", 3, 1, 0.33),
      topic("P01 Forces", 4, 4, 0.9),
    ]);
    storeMocks.statsState.getSessionSummaries.mockResolvedValue([summary()]);
    storeMocks.questionState.allQuestions = [
      question("q-weak-1", "M01 Algebra"),
      question("q-weak-2", "M01 Algebra"),
      question("q-strong", "P01 Forces"),
    ];

    renderProgress();

    fireEvent.click(await screen.findByRole("button", { name: /Drill these/i }));

    await waitFor(() => {
      expect(storeMocks.sessionState.createSession).toHaveBeenCalledWith({
        mode: "topic",
        question_ids: ["q-weak-1", "q-weak-2"],
        question_count: 2,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/session/weak-drill");
    });
  });

  it("navigates from recent sessions to results and active session routes", async () => {
    storeMocks.statsState.getAllStats.mockResolvedValue([topic("M01 Algebra", 5, 3)]);
    storeMocks.statsState.getSessionSummaries.mockResolvedValue([summary()]);
    storeMocks.sessionState.getRecentSessions.mockResolvedValue([
      session({ id: "completed-session", state: "completed" }),
      session({ id: "active-session", state: "active", completed_at: undefined }),
    ]);

    renderProgress();

    const completedStatus = await screen.findByText("completed");
    fireEvent.click(completedStatus.closest("button") as HTMLElement);
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/results/completed-session");
    });
  });

  it("navigates from an active recent session to its session route", async () => {
    storeMocks.statsState.getAllStats.mockResolvedValue([topic("M01 Algebra", 5, 3)]);
    storeMocks.statsState.getSessionSummaries.mockResolvedValue([summary()]);
    storeMocks.sessionState.getRecentSessions.mockResolvedValue([
      session({ id: "active-session", state: "active", completed_at: undefined }),
    ]);

    renderProgress();

    const activeStatus = await screen.findByText("active");
    fireEvent.click(activeStatus.closest("button") as HTMLElement);
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/session/active-session");
    });
  });
});
