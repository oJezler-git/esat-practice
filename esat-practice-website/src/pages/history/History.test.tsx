import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HistoryPage from ".";
import type { Session, SessionSummary } from "../../types/schema";

const storeMocks = vi.hoisted(() => ({
  sessionState: {
    getAllSessions: vi.fn(),
  },
  statsState: {
    getSessionSummaries: vi.fn(),
  },
}));

vi.mock("../../lib/sessionStore", () => ({
  useSessionStore: () => storeMocks.sessionState,
}));

vi.mock("../../lib/statsStore", () => ({
  useStatsStore: () => storeMocks.statsState,
}));

function dateAtNoon(daysAgo: number): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function session(overrides: Partial<Session> = {}): Session {
  const completedAt = dateAtNoon(0);
  return {
    id: "completed-today",
    created_at: completedAt - 10 * 60_000,
    completed_at: completedAt,
    mode: "timed",
    config: { question_ids: ["q1", "q2"], question_count: 2 },
    attempt_ids: ["a1", "a2"],
    state: "completed",
    ...overrides,
  };
}

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: "completed-today",
    mode: "timed",
    completed_at: dateAtNoon(0),
    attempts: 8,
    correct: 6,
    skipped: 2,
    accuracy: 0.75,
    total_time_ms: 160_000,
    avg_time_ms: 20_000,
    median_time_ms: 18_000,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={["/history"]}>
      <Routes>
        <Route
          path="/history"
          element={
            <>
              <HistoryPage />
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

describe("HistoryPage", () => {
  beforeEach(() => {
    storeMocks.sessionState.getAllSessions.mockReset().mockResolvedValue([]);
    storeMocks.statsState.getSessionSummaries.mockReset().mockResolvedValue([]);
  });

  it("renders the empty state when there are no sessions", async () => {
    renderHistory();

    expect(
      await screen.findByText(
        "No sessions yet. Complete a session to start building your history.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("All sessions")).not.toBeInTheDocument();
  });

  it("renders completed sessions, streaks, heatmap activity, and missing-summary fallbacks", async () => {
    storeMocks.sessionState.getAllSessions.mockResolvedValue([
      session(),
      session({
        id: "completed-yesterday",
        created_at: dateAtNoon(1) - 5 * 60_000,
        completed_at: dateAtNoon(1),
        mode: "mixed",
        attempt_ids: ["a3", "a4", "a5"],
      }),
    ]);
    storeMocks.statsState.getSessionSummaries.mockResolvedValue([summary()]);

    renderHistory();

    expect(await screen.findByText("All sessions")).toBeInTheDocument();
    expect(screen.getByText("Sessions").previousElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Questions answered").previousElementSibling).toHaveTextContent(
      "8",
    );
    expect(screen.getByText("Current streak").previousElementSibling).toHaveTextContent(
      "2d",
    );
    expect(screen.getByText("Best streak").previousElementSibling).toHaveTextContent("2d");
    expect(
      screen.getByLabelText(/Practice activity heatmap/i),
    ).toBeInTheDocument();

    const scoredCard = screen.getByText("75%").closest("button");
    expect(scoredCard).not.toBeNull();
    expect(within(scoredCard as HTMLElement).getByText("6/10")).toBeInTheDocument();
    expect(within(scoredCard as HTMLElement).getByText("10 questions")).toBeInTheDocument();
    expect(within(scoredCard as HTMLElement).getByText("20s/q avg")).toBeInTheDocument();
    expect(within(scoredCard as HTMLElement).getByText("10m 0s")).toBeInTheDocument();

    const fallbackCard = screen.getByText("mixed").closest("button");
    expect(fallbackCard).not.toBeNull();
    expect(within(fallbackCard as HTMLElement).getByText("3 questions")).toBeInTheDocument();
    expect(within(fallbackCard as HTMLElement).queryByText(/%$/)).not.toBeInTheDocument();
    expect(within(fallbackCard as HTMLElement).queryByText(/\/q avg$/)).not.toBeInTheDocument();
  });

  it("filters the session list by an active heatmap date and clears the filter", async () => {
    storeMocks.sessionState.getAllSessions.mockResolvedValue([
      session(),
      session({
        id: "completed-yesterday",
        created_at: dateAtNoon(1) - 5 * 60_000,
        completed_at: dateAtNoon(1),
        mode: "mixed",
      }),
    ]);
    storeMocks.statsState.getSessionSummaries.mockResolvedValue([
      summary(),
      summary({
        session_id: "completed-yesterday",
        mode: "mixed",
        completed_at: dateAtNoon(1),
        attempts: 4,
        correct: 2,
        skipped: 0,
        accuracy: 0.5,
      }),
    ]);

    renderHistory();

    await screen.findByText("All sessions");
    const todayLabel = new Date(dateAtNoon(0)).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const todayCellTitle = [...document.querySelectorAll("title")].find((title) =>
      title.textContent?.includes(`${todayLabel} — 8 questions`),
    );
    expect(todayCellTitle).toBeDefined();

    fireEvent.click(todayCellTitle?.parentElement as Element);

    expect(await screen.findByRole("heading", { name: todayLabel })).toBeInTheDocument();
    expect(screen.getByText("timed")).toBeInTheDocument();
    expect(screen.queryByText("mixed")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Clear filter/i }));

    expect(await screen.findByText("All sessions")).toBeInTheDocument();
    expect(screen.getByText("mixed")).toBeInTheDocument();
  });

  it("resumes an active session", async () => {
    storeMocks.sessionState.getAllSessions.mockResolvedValue([
      session({
        id: "active-session",
        completed_at: undefined,
        state: "active",
        mode: "topic",
      }),
    ]);

    renderHistory();

    fireEvent.click(await screen.findByRole("button", { name: /Resume/i }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/session/active-session");
    });
  });

  it("opens results for a completed session", async () => {
    storeMocks.sessionState.getAllSessions.mockResolvedValue([session()]);
    storeMocks.statsState.getSessionSummaries.mockResolvedValue([summary()]);

    renderHistory();

    fireEvent.click((await screen.findByText("75%")).closest("button") as HTMLElement);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/results/completed-today",
      );
    });
  });
});
