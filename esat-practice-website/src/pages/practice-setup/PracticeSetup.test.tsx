import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PracticeSetup from ".";
import { useSettingsStore } from "../../lib/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";
import type { Question, Session } from "../../types/schema";

const storeMocks = vi.hoisted(() => ({
  questionState: {
    questions: [] as Question[],
    availableTopics: [] as string[],
    availableYears: [] as number[],
    isLoading: false,
    loaded: true,
  },
  sessionState: {
    createSession: vi.fn(),
    getActiveSessions: vi.fn(),
    abandonSession: vi.fn(),
    getFlaggedQuestionIds: vi.fn(),
  },
  excludedState: {
    excludedQuestionIds: new Set<string>(),
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
  primaryTopic: string,
  year: number,
  page: number,
): Question {
  return {
    id,
    source: {
      paper: "ENGAA",
      year,
      part: "1A",
      subject: "Math",
      page,
    },
    content: { text: `${primaryTopic} question ${id}` },
    answer: { correct: "A", verified: true },
    taxonomy: {
      primary_topic: primaryTopic,
      secondary_topics: [],
      confidence: 0.95,
      model_used: "test",
    },
    meta: { times_attempted: 0, accuracy_rate: 0 },
  };
}

function makeSession(id: string, createdAt = Date.now() - 60_000): Session {
  return {
    id,
    created_at: createdAt,
    mode: "untimed",
    state: "active",
    attempt_ids: ["a1"],
    config: {
      question_ids: ["q1", "q2"],
      question_count: 2,
    },
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPracticeSetup() {
  return render(
    <MemoryRouter initialEntries={["/practice"]}>
      <Routes>
        <Route
          path="/practice"
          element={
            <>
              <PracticeSetup />
              <LocationProbe />
            </>
          }
        />
        <Route path="/session/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PracticeSetup", () => {
  beforeEach(() => {
    storeMocks.questionState.questions = [
      makeQuestion("q1", "Algebra", 2020, 2),
      makeQuestion("q2", "Mechanics", 2021, 1),
      makeQuestion("q3", "Algebra", 2021, 3),
    ];
    storeMocks.questionState.availableTopics = ["Algebra", "Mechanics"];
    storeMocks.questionState.availableYears = [2020, 2021];
    storeMocks.questionState.isLoading = false;
    storeMocks.questionState.loaded = true;
    storeMocks.excludedState.excludedQuestionIds = new Set();
    storeMocks.sessionState.createSession.mockResolvedValue(makeSession("new-session"));
    storeMocks.sessionState.getActiveSessions.mockResolvedValue([]);
    storeMocks.sessionState.getFlaggedQuestionIds.mockResolvedValue(new Set<string>());
    storeMocks.sessionState.abandonSession.mockResolvedValue(undefined);
    storeMocks.sessionState.createSession.mockClear();
    storeMocks.sessionState.getActiveSessions.mockClear();
    storeMocks.sessionState.abandonSession.mockClear();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        defaultMode: "untimed",
        defaultQuestionCount: 2,
        timedSecondsPerQ: 90,
        fullscreenOnStart: false,
      },
    });
  });

  it("starts a filtered timed session and navigates to the session route", async () => {
    renderPracticeSetup();

    fireEvent.click(screen.getByText("Timed").closest("button") as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Algebra" }));
    fireEvent.click(screen.getByRole("button", { name: "2021" }));
    fireEvent.change(screen.getByLabelText("Questions ·"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));

    await waitFor(() => {
      expect(storeMocks.sessionState.createSession).toHaveBeenCalledWith({
        mode: "timed",
        topic_filter: ["Algebra"],
        year_filter: [2021],
        question_count: 1,
        time_limit_ms: 90_000,
        question_ids: ["q3"],
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/session/new-session",
      );
    });
  });

  it("lets the user resume an active session", async () => {
    storeMocks.sessionState.getActiveSessions.mockResolvedValue([
      makeSession("active-session"),
    ]);

    renderPracticeSetup();

    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByTestId("location")).toHaveTextContent(
      "/session/active-session",
    );
  });

  it("lets the user discard an active session before starting a new one", async () => {
    storeMocks.sessionState.getActiveSessions.mockResolvedValue([
      makeSession("active-session"),
    ]);

    renderPracticeSetup();

    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Resume or discard your unfinished session first",
      }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => {
      expect(storeMocks.sessionState.abandonSession).toHaveBeenCalledWith(
        "active-session",
      );
    });

    const startButton = await screen.findByRole("button", {
      name: "Start session",
    });
    expect(startButton).toBeEnabled();

    fireEvent.click(startButton);

    await waitFor(() => {
      expect(storeMocks.sessionState.createSession).toHaveBeenCalled();
    });
  });
});
