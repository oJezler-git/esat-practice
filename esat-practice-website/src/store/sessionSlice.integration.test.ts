/**
 * Integration tests for the session slice against real IndexedDB semantics
 * (fake-indexeddb). Unlike sessionSlice.test.ts, nothing below the slice is
 * mocked except the bundled-data bootstrap: actions run through the real
 * sessionStore/questionStore/statsStore modules and land in a real object
 * store, so schema drift between the layers fails here.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSessionEngine, useSessionSlice } from "./sessionSlice";
import { createInitialSessionState } from "../engine/sessionEngine";
import { clearAllStores, getDb } from "../lib/db";
import {
  createSessionRecord,
  getAttemptsForSession,
  getSessionById,
  markSessionCompleted,
} from "../lib/sessionStore";
import { excludeQuestionInDb, getExcludedQuestionIdsFromDb } from "../lib/excludedQuestionStore";
import { getTopicStats } from "../lib/statsStore";
import { useSettingsStore } from "../lib/settingsStore";
import { makeAttempt, makeQuestion } from "../test-utils/factories";
import type { Question, Session } from "../types/schema";

// The only mock: question reads normally trigger the bundled-data fetch
// bootstrap, which has no network in tests. Everything else is real.
vi.mock("../lib/loader", () => ({
  ensureBundledQuestionsBootstrapped: vi.fn().mockResolvedValue(undefined),
}));

const questions: Question[] = [
  makeQuestion({ id: "q1", taxonomy: { primary_topic: "Algebra" } }),
  makeQuestion({ id: "q2", taxonomy: { primary_topic: "Mechanics" } }),
  makeQuestion({ id: "q3", taxonomy: { primary_topic: "Algebra" } }),
];

async function seedQuestions(): Promise<void> {
  const database = await getDb();
  for (const question of questions) {
    await database.put("questions", question);
  }
}

async function seedSession(
  overrides: { mode?: Session["mode"]; time_limit_ms?: number } = {},
): Promise<Session> {
  return createSessionRecord({
    mode: overrides.mode ?? "untimed",
    question_ids: questions.map((question) => question.id),
    question_count: questions.length,
    time_limit_ms: overrides.time_limit_ms,
  });
}

beforeEach(async () => {
  await clearAllStores();
  useSessionSlice.setState({ ...createInitialSessionState(), notFound: false });
  useSettingsStore.getState().reset();
});

describe("load", () => {
  it("hydrates an active session with its questions from the database", async () => {
    await seedQuestions();
    const session = await seedSession();

    await useSessionSlice.getState().load(session.id);

    const state = useSessionSlice.getState();
    expect(state.status).toBe("active");
    expect(state.session?.id).toBe(session.id);
    expect(state.questions.map((question) => question.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("flags notFound for a session id that is not in the database", async () => {
    await useSessionSlice.getState().load("missing-session");
    expect(useSessionSlice.getState().notFound).toBe(true);
  });

  it("drops excluded questions and persists the trimmed id list", async () => {
    await seedQuestions();
    const session = await seedSession();
    await excludeQuestionInDb("q2");

    await useSessionSlice.getState().load(session.id);

    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q1",
      "q3",
    ]);
    const persisted = await getSessionById(session.id);
    expect(persisted?.config.question_ids).toEqual(["q1", "q3"]);
    expect(persisted?.config.question_count).toBe(2);
  });

  it("tops up a question excluded while the session sat unfinished", async () => {
    const spare = makeQuestion({ id: "q4", taxonomy: { primary_topic: "Algebra" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", spare);
    const session = await seedSession();
    // As if another session's results auto-excluded q2 in the meantime.
    await excludeQuestionInDb("q2");

    await useSessionSlice.getState().load(session.id);

    const state = useSessionSlice.getState();
    expect(state.questions.map((question) => question.id)).toEqual(["q1", "q3", "q4"]);
    expect(state.topUpShortfall).toBe(0);
    const persisted = await getSessionById(session.id);
    expect(persisted?.config.question_ids).toEqual(["q1", "q3", "q4"]);
    expect(persisted?.config.question_count).toBe(3);
  });

  it("records a shortfall when a resumed session cannot be topped up", async () => {
    await seedQuestions();
    const session = await seedSession();
    await excludeQuestionInDb("q2");

    await useSessionSlice.getState().load(session.id);

    const state = useSessionSlice.getState();
    expect(state.questions.map((question) => question.id)).toEqual(["q1", "q3"]);
    expect(state.topUpShortfall).toBe(1);
  });

  it("tops up a question that has vanished from the bank entirely", async () => {
    const spare = makeQuestion({ id: "q4", taxonomy: { primary_topic: "Algebra" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", spare);
    // A dataset version bump renumbered q2 out of existence.
    const session = await seedSession();
    await database.delete("questions", "q2");

    await useSessionSlice.getState().load(session.id);

    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q1",
      "q3",
      "q4",
    ]);
  });

  it("leaves a completed session short rather than topping it up", async () => {
    const spare = makeQuestion({ id: "q4", taxonomy: { primary_topic: "Algebra" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", spare);
    const session = await seedSession();
    await markSessionCompleted(session.id);
    await excludeQuestionInDb("q2");

    await useSessionSlice.getState().load(session.id);

    // A finished session is a record of what happened; adding a question the
    // user never saw would rewrite history.
    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q1",
      "q3",
    ]);
  });

  it("restores prior attempts, flags, and remaining time on rehydrate", async () => {
    await seedQuestions();
    const session = await seedSession({ mode: "timed", time_limit_ms: 60_000 });
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().mark("correct");
    await useSessionSlice.getState().flag();
    await useSessionSlice.getState().tick(10_000);
    await useSessionSlice.getState().nav("next");

    // Fresh hydrate, as if the page reloaded.
    useSessionSlice.setState({ ...createInitialSessionState(), notFound: false });
    await useSessionSlice.getState().load(session.id);

    const state = useSessionSlice.getState();
    expect(state.responses["q1"].result).toBe("correct");
    expect(state.flagged.has("q1")).toBe(true);
    expect(state.timeRemaining).toBe(60_000 - 10_000);
  });
});

describe("mark / flag / skip", () => {
  it("persists a marked attempt and links it on the session record", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().mark("correct");

    const attempts = await getAttemptsForSession(session.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      question_id: "q1",
      session_id: session.id,
      result: "correct",
    });
    const persisted = await getSessionById(session.id);
    expect(persisted?.attempt_ids).toEqual([attempts[0].id]);
  });

  it("persists flag state on the attempt record", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().flag();

    const attempts = await getAttemptsForSession(session.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].flagged).toBe(true);
  });

  it("records a skipped attempt with accumulated time and advances", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().tick(4_000);
    await useSessionSlice.getState().skip();

    const state = useSessionSlice.getState();
    expect(state.currentIndex).toBe(1);
    const attempts = await getAttemptsForSession(session.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].result).toBe("skipped");
    expect(attempts[0].time_ms).toBe(4_000);
  });
});

describe("navigation", () => {
  it("commits elapsed time to the attempt when navigating away", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().tick(2_500);
    await useSessionSlice.getState().nav("next");
    // Coming back and spending more time accumulates on the same attempt.
    await useSessionSlice.getState().nav("prev");
    await useSessionSlice.getState().tick(1_500);
    await useSessionSlice.getState().nav("next");

    const attempts = await getAttemptsForSession(session.id);
    const first = attempts.find((attempt) => attempt.question_id === "q1");
    expect(first?.time_ms).toBe(4_000);
  });

  it("leaves a question unanswered when navigating past it", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().tick(2_500);
    await useSessionSlice.getState().nav("next");

    // Time is banked, but passing over a question must not mark it: it stays
    // unanswered so the user can come back and mark it themselves.
    const attempts = await getAttemptsForSession(session.id);
    const first = attempts.find((attempt) => attempt.question_id === "q1");
    expect(first?.result).toBe("unanswered");
    expect(first?.time_ms).toBe(2_500);

    // And the answer stays hidden on return: the engine reports no result, which
    // is what drives the reveal.
    const { result } = renderHook(() => useSessionEngine(session.id));
    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });
    expect(result.current.currentAttemptResult).toBeUndefined();
  });

  it("still scores an unanswered question as skipped on submit", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().nav("next");
    await useSessionSlice.getState().mark("correct");
    await useSessionSlice.getState().submit();

    const attempts = await getAttemptsForSession(session.id);
    expect(attempts.find((attempt) => attempt.question_id === "q1")?.result).toBe(
      "skipped",
    );
    expect(attempts.find((attempt) => attempt.question_id === "q2")?.result).toBe(
      "correct",
    );
  });

  it("jumpTo clamps out-of-range targets", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().jumpTo(99);
    expect(useSessionSlice.getState().currentIndex).toBe(2);
    await useSessionSlice.getState().jumpTo(-5);
    expect(useSessionSlice.getState().currentIndex).toBe(0);
  });
});

describe("submit", () => {
  it("completes the session, saves all attempts, and rebuilds topic stats", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().mark("correct");
    await useSessionSlice.getState().nav("next");
    await useSessionSlice.getState().mark("incorrect");
    await useSessionSlice.getState().submit();

    expect(useSessionSlice.getState().status).toBe("completed");

    const persisted = await getSessionById(session.id);
    expect(persisted?.state).toBe("completed");
    expect(persisted?.completed_at).toBeTypeOf("number");

    // Unanswered q3 is stored as skipped.
    const attempts = await getAttemptsForSession(session.id);
    expect(attempts).toHaveLength(3);
    expect(attempts.find((attempt) => attempt.question_id === "q3")?.result).toBe("skipped");

    // Real recomputeAllStats derived per-topic stats from the attempts store.
    const stats = await getTopicStats();
    const algebra = stats.find((stat) => stat.topic === "Algebra");
    const mechanics = stats.find((stat) => stat.topic === "Mechanics");
    expect(algebra).toMatchObject({ attempts: 1, correct: 1 });
    expect(mechanics).toMatchObject({ attempts: 1, correct: 0 });
  });

  it("auto-submits when a timed session ticks down to zero", async () => {
    await seedQuestions();
    const session = await seedSession({ mode: "timed", time_limit_ms: 5_000 });
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().mark("correct");
    await useSessionSlice.getState().tick(5_000);

    expect(useSessionSlice.getState().status).toBe("completed");
    const persisted = await getSessionById(session.id);
    expect(persisted?.state).toBe("completed");
  });
});

describe("excludeCurrentQuestion", () => {
  it("records the exclusion and rewrites the session question list", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().excludeCurrentQuestion();

    const excludedIds = await getExcludedQuestionIdsFromDb();
    expect(excludedIds.has("q1")).toBe(true);
    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q2",
      "q3",
    ]);
    const persisted = await getSessionById(session.id);
    expect(persisted?.config.question_ids).toEqual(["q2", "q3"]);
  });

  it("appends a replacement question so the session keeps its length", async () => {
    const spare = makeQuestion({ id: "q4", taxonomy: { primary_topic: "Algebra" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", spare);
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().excludeCurrentQuestion([...questions, spare]);

    const state = useSessionSlice.getState();
    expect(state.questions.map((question) => question.id)).toEqual(["q2", "q3", "q4"]);
    // The cursor stays on the slot the excluded question vacated.
    expect(state.currentIndex).toBe(0);
    const persisted = await getSessionById(session.id);
    expect(persisted?.config.question_ids).toEqual(["q2", "q3", "q4"]);
    expect(persisted?.config.question_count).toBe(3);
  });

  it("does not reuse an already-excluded question as a replacement", async () => {
    const spare = makeQuestion({ id: "q4", taxonomy: { primary_topic: "Algebra" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", spare);
    await excludeQuestionInDb("q4");
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().excludeCurrentQuestion([...questions, spare]);

    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q2",
      "q3",
    ]);
  });

  it("keeps the replacement within the session's topic filter", async () => {
    const offTopic = makeQuestion({ id: "q4", taxonomy: { primary_topic: "Mechanics" } });
    const onTopic = makeQuestion({ id: "q5", taxonomy: { primary_topic: "Algebra" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", offTopic);
    await database.put("questions", onTopic);
    const session = await createSessionRecord({
      mode: "untimed",
      question_ids: ["q1", "q3"],
      question_count: 2,
      topic_filter: ["Algebra"],
    });
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice
      .getState()
      .excludeCurrentQuestion([...questions, offTopic, onTopic]);

    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q3",
      "q5",
    ]);
  });

  it("tops a flagged-only session up from flagged questions only", async () => {
    const unflagged = makeQuestion({ id: "q4", taxonomy: { primary_topic: "Algebra" } });
    const flagged = makeQuestion({ id: "q5", taxonomy: { primary_topic: "Algebra" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", unflagged);
    await database.put("questions", flagged);
    // q5 carries a flagged attempt from an earlier session; q4 does not.
    await database.put(
      "attempts",
      makeAttempt({ id: "a-q5", question_id: "q5", session_id: "old", flagged: true }),
    );
    const session = await createSessionRecord({
      mode: "untimed",
      question_ids: ["q1", "q3"],
      question_count: 2,
      flagged_only: true,
    });
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice
      .getState()
      .excludeCurrentQuestion([...questions, unflagged, flagged]);

    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q3",
      "q5",
    ]);
  });

  it("does not top up from a subject the user has disabled", async () => {
    // Sorts before "q2" by id, so an unfiltered pool would reach for it first.
    const biology = makeQuestion({ id: "b4", taxonomy: { primary_topic: "B1 Cells" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", biology);
    useSettingsStore.getState().update({
      enabledSubjects: ["maths1", "maths2", "physics", "chemistry"],
    });
    const session = await createSessionRecord({
      mode: "untimed",
      question_ids: ["q1", "q3"],
      question_count: 2,
    });
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().excludeCurrentQuestion([...questions, biology]);

    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q3",
      "q2",
    ]);
  });

  it("does not top up with an NSAA duplicate the bank hides", async () => {
    // Same year, part and text, so the dedup analysis pairs them and hides the
    // NSAA side. Its id sorts first, so an unfiltered pool would pick it.
    const duplicateText = "A particle moves with constant acceleration. Find v.";
    const nsaaTwin = makeQuestion({
      id: "d-twin",
      source: { paper: "NSAA 2022" },
      content: { text: duplicateText },
    });
    const engaaTwin = makeQuestion({
      id: "e-twin",
      source: { paper: "ENGAA 2022" },
      content: { text: duplicateText },
    });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", nsaaTwin);
    await database.put("questions", engaaTwin);
    const session = await createSessionRecord({
      mode: "untimed",
      question_ids: ["q1", "q3"],
      question_count: 2,
      topic_filter: ["Algebra"],
    });
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice
      .getState()
      .excludeCurrentQuestion([...questions, nsaaTwin, engaaTwin]);

    expect(useSessionSlice.getState().questions.map((question) => question.id)).toEqual([
      "q3",
      "e-twin",
    ]);
  });

  it("records a shortfall when the bank has no replacement left", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    // Every question in the bank is already in the session, so the top-up has
    // nothing to draw on and the session simply gets shorter.
    await useSessionSlice.getState().excludeCurrentQuestion(questions);

    const state = useSessionSlice.getState();
    expect(state.questions.map((question) => question.id)).toEqual(["q2", "q3"]);
    expect(state.topUpShortfall).toBe(1);
  });

  it("accumulates the shortfall across repeated exclusions", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().excludeCurrentQuestion(questions);
    await useSessionSlice.getState().excludeCurrentQuestion(questions);

    expect(useSessionSlice.getState().topUpShortfall).toBe(2);
  });

  it("leaves the shortfall at zero when a replacement is found", async () => {
    const spare = makeQuestion({ id: "q4", taxonomy: { primary_topic: "Algebra" } });
    const database = await getDb();
    await seedQuestions();
    await database.put("questions", spare);
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().excludeCurrentQuestion([...questions, spare]);

    expect(useSessionSlice.getState().topUpShortfall).toBe(0);
  });

  it("submits automatically when the last question is excluded", async () => {
    const only = makeQuestion({ id: "solo" });
    const database = await getDb();
    await database.put("questions", only);
    const session = await createSessionRecord({
      mode: "untimed",
      question_ids: ["solo"],
      question_count: 1,
    });
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().excludeCurrentQuestion();

    expect(useSessionSlice.getState().status).toBe("completed");
    expect((await getSessionById(session.id))?.state).toBe("completed");
  });
});

describe("useSessionEngine", () => {
  it("loads the session on mount and exposes derived question state", async () => {
    await seedQuestions();
    const session = await seedSession();

    const { result, unmount } = renderHook(() => useSessionEngine(session.id));

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });
    expect(result.current.currentQuestion?.id).toBe("q1");
    expect(result.current.totalCount).toBe(3);
    expect(result.current.isFlagged).toBe(false);
    expect(result.current.currentAttemptResult).toBeUndefined();

    await act(async () => {
      await result.current.mark("correct");
    });
    expect(result.current.currentAttemptResult).toBe("correct");

    await act(async () => {
      await result.current.flag();
    });
    expect(result.current.isFlagged).toBe(true);

    unmount();
  });

  it("surfaces notFound for an unknown session id", async () => {
    const { result, unmount } = renderHook(() => useSessionEngine("missing"));

    await waitFor(() => {
      expect(result.current.notFound).toBe(true);
    });
    expect(result.current.session).toBeNull();

    unmount();
  });
});

describe("quit / pause", () => {
  it("marks the session abandoned in the database on quit", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().quit();

    expect(useSessionSlice.getState().status).toBe("abandoned");
    expect((await getSessionById(session.id))?.state).toBe("abandoned");
  });

  it("pause commits elapsed time without changing session state", async () => {
    await seedQuestions();
    const session = await seedSession();
    await useSessionSlice.getState().load(session.id);

    await useSessionSlice.getState().tick(3_000);
    await useSessionSlice.getState().pause();

    expect(useSessionSlice.getState().status).toBe("active");
    const attempts = await getAttemptsForSession(session.id);
    expect(attempts[0]?.time_ms).toBe(3_000);
    expect((await getSessionById(session.id))?.state).toBe("active");
  });
});
