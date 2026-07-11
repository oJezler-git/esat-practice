/**
 * End-to-end integration of the real pages, router wiring, session slice, and
 * persistence: /practice → /session/:id → /results/:id against fake-indexeddb.
 * Nothing below the pages is mocked except the bundled-data bootstrap (which
 * fetches over the network). If the engine, slice, stores, or pages drift
 * apart, this is the test that fails.
 */
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PracticeSetup from "../pages/practice-setup";
import SessionPage from "../pages/session";
import ResultsPage from "../pages/results";
import { useSessionSlice } from "../store/sessionSlice";
import { createInitialSessionState } from "../engine/sessionEngine";
import { clearAllStores, getDb } from "../lib/db";
import { getAttemptsForSession } from "../lib/sessionStore";
import {
  getExcludedQuestionIdsFromDb,
  refreshExcludedQuestionsStore,
} from "../lib/excludedQuestionStore";
import { useSettingsStore } from "../lib/settingsStore";
import { DEFAULT_SETTINGS } from "../types/settings";
import { makeQuestion } from "../test-utils/factories";
import type { Session } from "../types/schema";

vi.mock("../lib/loader", () => ({
  ensureBundledQuestionsBootstrapped: vi.fn().mockResolvedValue(undefined),
}));

// Untimed sessions order by year/page, so this seed order is the play order.
const questions = [
  makeQuestion({ id: "q1", source: { page: 1 }, content: { text: "First question about vectors" } }),
  makeQuestion({ id: "q2", source: { page: 2 }, content: { text: "Second question about circuits" } }),
  makeQuestion({ id: "q3", source: { page: 3 }, content: { text: "Third question about waves" } }),
];

async function seedQuestions(): Promise<void> {
  const database = await getDb();
  for (const question of questions) {
    await database.put("questions", question);
  }
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/practice"]}>
      <Routes>
        <Route path="/practice" element={<PracticeSetup />} />
        <Route path="/session/:id" element={<SessionPage />} />
        <Route path="/results/:id" element={<ResultsPage />} />
        <Route path="/" element={<div>home stub</div>} />
        <Route path="/progress" element={<div>progress stub</div>} />
        <Route path="/settings" element={<div>settings stub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Reveal the current question's answer, then self-mark it. */
function markCurrent(container: HTMLElement, result: "correct" | "incorrect") {
  fireEvent.click(screen.getByRole("button", { name: /Reveal answer/ }));
  const selector = `.selfmark-action-button-${result}`;
  const button = container.querySelector(selector);
  if (!button) throw new Error(`no ${selector} button`);
  fireEvent.click(button);
}

async function latestSession(): Promise<Session> {
  const database = await getDb();
  const sessions = await database.getAll("sessions");
  expect(sessions.length).toBeGreaterThan(0);
  return sessions.sort((a, b) => b.created_at - a.created_at)[0];
}

beforeEach(async () => {
  await clearAllStores();
  useSessionSlice.setState({ ...createInitialSessionState(), notFound: false });
  localStorage.clear();
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      // Keep the flow deterministic: no auto-advance timers, no fullscreen
      // request, and no auto-exclusion rewriting the pool mid-test.
      autoAdvance: false,
      fullscreenOnStart: false,
      autoExclude: false,
    },
  });
  await seedQuestions();
  // The excluded-question store is module-level state; re-read the (now
  // empty) table so exclusions from a previous test don't leak in.
  await refreshExcludedQuestionsStore();
});

describe("practice → session → results flow", () => {
  it("runs a full session and shows the scored review backed by real IDB", async () => {
    const { container } = renderApp();

    // Practice setup loads the seeded bank and starts an untimed session.
    await screen.findByText("3 questions loaded");
    fireEvent.click(screen.getByRole("button", { name: /Start session/ }));

    // Question 1: correct.
    await screen.findByText("Question 1 of 3");
    expect(screen.getByText(/First question about vectors/)).toBeInTheDocument();
    markCurrent(container, "correct");
    await waitFor(() => {
      expect(container.querySelector(".selfmark-result-label")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));

    // Question 2: incorrect.
    await screen.findByText("Question 2 of 3");
    expect(screen.getByText(/Second question about circuits/)).toBeInTheDocument();
    markCurrent(container, "incorrect");
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));

    // Question 3: correct, then submit (only enabled once answered).
    await screen.findByText("Question 3 of 3");
    const submit = screen.getByRole("button", { name: /Submit session/ });
    expect(submit).toBeDisabled();
    markCurrent(container, "correct");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Submit session/ })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit session/ }));

    // Auto-navigates to /results/:id, which re-reads everything from IDB.
    await screen.findByText("Review");
    const rows = container.querySelectorAll(".sk-results-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("First question about vectors");
    expect(rows[0]).toHaveTextContent("correct");
    expect(rows[1]).toHaveTextContent("incorrect");
    expect(rows[2]).toHaveTextContent("correct");

    // The database agrees with what the page shows.
    const session = await latestSession();
    expect(session.state).toBe("completed");
    const attempts = await getAttemptsForSession(session.id);
    expect(attempts).toHaveLength(3);
    expect(
      Object.fromEntries(attempts.map((a) => [a.question_id, a.result])),
    ).toEqual({ q1: "correct", q2: "incorrect", q3: "correct" });
  });

  it("auto-exclude removes only questions matching the predicate after results load", async () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        autoExclude: true,
        autoExcludeOn: "correct",
      },
    });
    const { container } = renderApp();

    await screen.findByText("3 questions loaded");
    fireEvent.click(screen.getByRole("button", { name: /Start session/ }));

    await screen.findByText("Question 1 of 3");
    markCurrent(container, "correct");
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await screen.findByText("Question 2 of 3");
    markCurrent(container, "incorrect");
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await screen.findByText("Question 3 of 3");
    markCurrent(container, "correct");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Submit session/ })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit session/ }));

    // The results page auto-excludes the two correct questions and says so.
    await screen.findByText(
      "2 questions marked as done and removed from future sessions.",
    );
    const excluded = await getExcludedQuestionIdsFromDb();
    expect([...excluded].sort()).toEqual(["q1", "q3"]);

    // The incorrect question is the only one left in the practice pool.
    fireEvent.click(screen.getByRole("link", { name: /New session/ }));
    await screen.findByText("1 of 1 questions available");
  });

  it("excluding a question mid-session removes it from the pool for new sessions", async () => {
    const { container } = renderApp();

    await screen.findByText("3 questions loaded");
    fireEvent.click(screen.getByRole("button", { name: /Start session/ }));
    await screen.findByText("Question 1 of 3");

    // Exclude the current question (q1); the session trims to the survivors.
    const excludeButton = container.querySelector(".session-exclude-btn");
    if (!excludeButton) throw new Error("no exclude button");
    fireEvent.click(excludeButton);
    await screen.findByText("Question 1 of 2");
    expect(screen.getByText(/Second question about circuits/)).toBeInTheDocument();
    expect(await getExcludedQuestionIdsFromDb()).toContain("q1");

    // Finish the shortened session.
    markCurrent(container, "correct");
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await screen.findByText("Question 2 of 2");
    markCurrent(container, "correct");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Submit session/ })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit session/ }));
    await screen.findByText("Review");

    // A new session from the setup page never sees the excluded question.
    fireEvent.click(screen.getByRole("link", { name: /New session/ }));
    // useQuestionStore's `questions` already has exclusions applied, so the
    // header counts 2 in the pool with 2 available (q1 is gone entirely).
    await screen.findByText("2 of 2 questions available");
    fireEvent.click(screen.getByRole("button", { name: /Start session/ }));
    await screen.findByText("Question 1 of 2");
    expect(screen.queryByText(/First question about vectors/)).not.toBeInTheDocument();
  });
});
