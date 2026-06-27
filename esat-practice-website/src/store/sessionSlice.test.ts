import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSessionSlice } from "./sessionSlice";
import * as questionStore from "../lib/questionStore";
import * as sessionStore from "../lib/sessionStore";
import * as statsStore from "../lib/statsStore";

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
    // Reset Zustand state manually if needed, though for these tests we can just reload
  });

  const mockQuestions = [
    { id: "q1", taxonomy: { primary_topic: "Math" } },
    { id: "q2", taxonomy: { primary_topic: "Physics" } },
  ] as any;

  const mockSession = {
    id: "s1",
    state: "active",
    mode: "untimed",
    config: { question_ids: ["q1", "q2"] },
  } as any;

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
        q1: { question_id: "q1", result: "correct", time_ms: 1000 } as any,
        q2: { question_id: "q2", result: "incorrect", time_ms: 1000 } as any,
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

  it("does not persist twice when submit is triggered concurrently", async () => {
    useSessionSlice.setState({
      session: mockSession,
      questions: mockQuestions,
      status: "active",
      currentIndex: 0,
      responses: {
        q1: { question_id: "q1", result: "correct", time_ms: 1000 } as any,
        q2: { question_id: "q2", result: "incorrect", time_ms: 1000 } as any,
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
