import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSessionSlice } from "./sessionSlice";
import { createInitialSessionState } from "../engine/sessionEngine";
import * as questionStore from "../lib/questionStore";
import * as sessionStore from "../lib/sessionStore";
import * as statsStore from "../lib/statsStore";
import { makeAttempt, makeQuestion, makeSession } from "../test-utils/factories";

// Mock the external stores
vi.mock("../lib/questionStore");
vi.mock("../lib/sessionStore");
vi.mock("../lib/statsStore");
vi.mock("../lib/excludedQuestionStore", () => ({
  getExcludedQuestionIdsFromDb: vi.fn().mockResolvedValue(new Set()),
}));

describe("sessionSlice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionSlice.setState({
      ...createInitialSessionState(),
      notFound: false,
    });
  });

  const mockQuestions = [
    makeQuestion({ id: "q1", taxonomy: { primary_topic: "Math" } }),
    makeQuestion({ id: "q2", taxonomy: { primary_topic: "Physics" } }),
  ];

  const mockSession = makeSession({
    id: "s1",
    state: "active",
    mode: "untimed",
    config: { question_ids: ["q1", "q2"] },
  });

  it("should load a session and its questions", async () => {
    vi.mocked(sessionStore.getSessionById).mockResolvedValue(mockSession);
    vi.mocked(questionStore.getQuestionsByIdsFromDb).mockResolvedValue(mockQuestions);
    vi.mocked(sessionStore.getAttemptsForSession).mockResolvedValue([]);

    const store = useSessionSlice.getState();
    await store.load("s1");

    const updatedState = useSessionSlice.getState();
    expect(updatedState.session?.id).toBe("s1");
    expect(updatedState.questions).toHaveLength(2);
    expect(updatedState.status).toBe("active");
  });

  it("should mark a question and save the attempt", async () => {
    // Setup state
    useSessionSlice.setState({
      session: mockSession,
      questions: mockQuestions,
      status: "active",
      currentIndex: 0,
      responses: {},
      flagged: new Set(),
    });

    const store = useSessionSlice.getState();
    await store.mark("correct");

    const updatedState = useSessionSlice.getState();
    expect(updatedState.responses["q1"].result).toBe("correct");
    expect(sessionStore.upsertAttemptRecord).toHaveBeenCalled();
  });

  it("should submit a session and update stats", async () => {
    useSessionSlice.setState({
      session: mockSession,
      questions: mockQuestions,
      status: "active",
      currentIndex: 0,
      responses: {
        q1: makeAttempt({ id: "a1", question_id: "q1", result: "correct" }),
        q2: makeAttempt({ id: "a2", question_id: "q2", result: "incorrect" }),
      },
      flagged: new Set(),
    });

    vi.mocked(sessionStore.getSessionById).mockResolvedValue({ ...mockSession, state: "completed" });

    const store = useSessionSlice.getState();
    await store.submit();

    const updatedState = useSessionSlice.getState();
    expect(updatedState.status).toBe("completed");
    expect(sessionStore.saveSessionAttempts).toHaveBeenCalled();
    expect(statsStore.recomputeAllStats).toHaveBeenCalled();
    expect(sessionStore.markSessionCompleted).toHaveBeenCalledWith("s1");
  });

  it("should quit a session and mark it abandoned", async () => {
    useSessionSlice.setState({
      session: mockSession,
      questions: mockQuestions,
      status: "active",
      currentIndex: 0,
      responses: {},
      flagged: new Set(),
    });

    const store = useSessionSlice.getState();
    await store.quit();

    const updatedState = useSessionSlice.getState();
    expect(updatedState.status).toBe("abandoned");
    expect(sessionStore.markSessionAbandoned).toHaveBeenCalledWith("s1");
  });

  it("should pause a session by committing elapsed time without abandoning it", async () => {
    useSessionSlice.setState({
      session: mockSession,
      questions: mockQuestions,
      status: "active",
      currentIndex: 0,
      questionElapsed: 5000,
      responses: {},
      flagged: new Set(),
    });

    const store = useSessionSlice.getState();
    await store.pause();

    const updatedState = useSessionSlice.getState();
    expect(updatedState.status).toBe("active");
    expect(updatedState.questionElapsed).toBe(0);
    expect(updatedState.responses["q1"].time_ms).toBe(5000);
    expect(sessionStore.upsertAttemptRecord).toHaveBeenCalled();
    expect(sessionStore.markSessionAbandoned).not.toHaveBeenCalled();
  });

  it("does nothing when pause is called with no active session", async () => {
    useSessionSlice.setState({
      session: null,
      questions: [],
      status: "idle",
      currentIndex: 0,
      questionElapsed: 0,
      responses: {},
      flagged: new Set(),
    });

    const store = useSessionSlice.getState();
    await store.pause();

    expect(sessionStore.upsertAttemptRecord).not.toHaveBeenCalled();
  });

  it("does nothing when quit is called with no active session", async () => {
    useSessionSlice.setState({
      session: null,
      questions: [],
      status: "idle",
      currentIndex: 0,
      responses: {},
      flagged: new Set(),
    });

    const store = useSessionSlice.getState();
    await store.quit();

    expect(sessionStore.markSessionAbandoned).not.toHaveBeenCalled();
  });

  it("does not persist twice when submit is triggered concurrently", async () => {
    useSessionSlice.setState({
      session: mockSession,
      questions: mockQuestions,
      status: "active",
      currentIndex: 0,
      responses: {
        q1: makeAttempt({ id: "a1", question_id: "q1", result: "correct" }),
        q2: makeAttempt({ id: "a2", question_id: "q2", result: "incorrect" }),
      },
      flagged: new Set(),
    });

    vi.mocked(sessionStore.getSessionById).mockResolvedValue({
      ...mockSession,
      state: "completed",
    });

    const store = useSessionSlice.getState();
    // Fire the timer auto-submit and a manual submit at the same time.
    await Promise.all([store.submit(), store.submit()]);

    expect(sessionStore.saveSessionAttempts).toHaveBeenCalledTimes(1);
    expect(statsStore.recomputeAllStats).toHaveBeenCalledTimes(1);
    expect(sessionStore.markSessionCompleted).toHaveBeenCalledTimes(1);
  });
});
