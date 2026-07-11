import { describe, it, expect } from "vitest";
import {
  createInitialSessionState,
  getCurrentQuestion,
  hydrateSessionState,
  reduceSessionState,
} from "./sessionEngine";
import { makeAttempt, makeQuestion, makeSession } from "../test-utils/factories";

describe("sessionEngine", () => {
  const mockQuestions = [
    makeQuestion({ id: "q1", taxonomy: { primary_topic: "T1" } }),
    makeQuestion({ id: "q2", taxonomy: { primary_topic: "T2" } }),
    makeQuestion({ id: "q3", taxonomy: { primary_topic: "T3" } }),
  ];

  const getActiveState = () => ({
    ...createInitialSessionState(),
    status: "active" as const,
    questions: mockQuestions,
    currentIndex: 0,
  });

  describe("Navigation (NAV)", () => {
    it("should navigate to the next question", () => {
      const nextState = reduceSessionState(getActiveState(), {
        type: "NAV",
        direction: "next",
      });
      expect(nextState.currentIndex).toBe(1);
    });

    it("should clamp to the last question", () => {
      const state = { ...getActiveState(), currentIndex: 2 };
      const nextState = reduceSessionState(state, {
        type: "NAV",
        direction: "next",
      });
      expect(nextState.currentIndex).toBe(2);
    });

    it("should navigate to the previous question", () => {
      const state = { ...getActiveState(), currentIndex: 1 };
      const nextState = reduceSessionState(state, {
        type: "NAV",
        direction: "prev",
      });
      expect(nextState.currentIndex).toBe(0);
    });

    it("should clamp to the first question", () => {
      const nextState = reduceSessionState(getActiveState(), {
        type: "NAV",
        direction: "prev",
      });
      expect(nextState.currentIndex).toBe(0);
    });

    it("should reset per-question elapsed time when navigating", () => {
      const state = { ...getActiveState(), questionElapsed: 7000 };
      const nextState = reduceSessionState(state, {
        type: "NAV",
        direction: "next",
      });
      expect(nextState.questionElapsed).toBe(0);
    });
  });

  describe("START", () => {
    it("should reset to a configured state carrying the time limit", () => {
      const dirty = {
        ...getActiveState(),
        responses: { q1: makeAttempt({ question_id: "q1" }) },
        flagged: new Set(["q1"]),
      };
      const nextState = reduceSessionState(dirty, {
        type: "START",
        config: { mode: "timed", question_count: 2, time_limit_ms: 90_000 },
      });

      expect(nextState.status).toBe("configured");
      expect(nextState.timeRemaining).toBe(90_000);
      expect(nextState.responses).toEqual({});
      expect(nextState.flagged.size).toBe(0);
    });
  });

  describe("Marking and Flagging", () => {
    it("should mark a question with a result", () => {
      const nextState = reduceSessionState(getActiveState(), {
        type: "MARK",
        question_id: "q1",
        result: "correct",
      });
      expect(nextState.responses["q1"].result).toBe("correct");
    });

    it("should create a draft attempt when marking a question with no response yet", () => {
      const nextState = reduceSessionState(getActiveState(), {
        type: "MARK",
        question_id: "q2",
        result: "incorrect",
      });
      expect(nextState.responses["q2"]).toMatchObject({
        question_id: "q2",
        result: "incorrect",
        time_ms: 0,
      });
    });

    it("should toggle a flag on a question", () => {
      const activeState = getActiveState();
      // Flag on
      const state1 = reduceSessionState(activeState, {
        type: "FLAG",
        question_id: "q1",
      });
      expect(state1.flagged.has("q1")).toBe(true);

      // Flag off
      const state2 = reduceSessionState(state1, {
        type: "FLAG",
        question_id: "q1",
      });
      expect(state2.flagged.has("q1")).toBe(false);
    });

    it("should mirror the flag onto an existing attempt record", () => {
      const state = {
        ...getActiveState(),
        responses: {
          q1: makeAttempt({ question_id: "q1", flagged: false }),
        },
      };
      const nextState = reduceSessionState(state, {
        type: "FLAG",
        question_id: "q1",
      });
      expect(nextState.responses["q1"].flagged).toBe(true);
    });
  });

  describe("SKIP", () => {
    it("should record a skipped result for the question", () => {
      const nextState = reduceSessionState(getActiveState(), {
        type: "SKIP",
        question_id: "q1",
      });
      expect(nextState.responses["q1"].result).toBe("skipped");
    });

    it("should overwrite an earlier mark with skipped", () => {
      const state = {
        ...getActiveState(),
        responses: {
          q1: makeAttempt({ question_id: "q1", result: "correct" }),
        },
      };
      const nextState = reduceSessionState(state, {
        type: "SKIP",
        question_id: "q1",
      });
      expect(nextState.responses["q1"].result).toBe("skipped");
    });
  });

  describe("Timer (TICK)", () => {
    it("should decrease time remaining", () => {
      const timedState = { ...getActiveState(), timeRemaining: 10000 };
      const nextState = reduceSessionState(timedState, {
        type: "TICK",
        ms: 1000,
      });
      expect(nextState.timeRemaining).toBe(9000);
    });

    it("should switch to reviewing status when time runs out", () => {
      const timedState = { ...getActiveState(), timeRemaining: 500 };
      const nextState = reduceSessionState(timedState, {
        type: "TICK",
        ms: 1000,
      });
      expect(nextState.timeRemaining).toBe(0);
      expect(nextState.status).toBe("reviewing");
    });

    it("should increment question elapsed time", () => {
      const nextState = reduceSessionState(getActiveState(), {
        type: "TICK",
        ms: 500,
      });
      expect(nextState.questionElapsed).toBe(500);
    });

    it("should ignore ticks when the session is not active", () => {
      const reviewingState = {
        ...getActiveState(),
        status: "reviewing" as const,
        timeRemaining: 10_000,
      };
      const nextState = reduceSessionState(reviewingState, {
        type: "TICK",
        ms: 1000,
      });
      expect(nextState).toBe(reviewingState);
    });
  });

  describe("Session Lifecycle", () => {
    it("should handle SUBMIT action", () => {
      const nextState = reduceSessionState(getActiveState(), { type: "SUBMIT" });
      expect(nextState.status).toBe("reviewing");
    });

    it("should handle QUIT action", () => {
      const nextState = reduceSessionState(getActiveState(), { type: "QUIT" });
      expect(nextState.status).toBe("abandoned");
    });
  });

  describe("getCurrentQuestion", () => {
    it("returns the question at the current index", () => {
      const state = { ...getActiveState(), currentIndex: 1 };
      expect(getCurrentQuestion(state)?.id).toBe("q2");
    });

    it("returns undefined when there are no questions", () => {
      expect(getCurrentQuestion(createInitialSessionState())).toBeUndefined();
    });
  });

  describe("hydrateSessionState", () => {
    it("should correctly hydrate from session, questions and attempts", () => {
      const mockSession = makeSession({
        id: "s1",
        state: "active",
        mode: "timed",
        config: { time_limit_ms: 60000, question_ids: ["q1", "q2"] },
      });
      const mockAttempts = [
        makeAttempt({
          question_id: "q1",
          session_id: "s1",
          result: "correct",
          time_ms: 10000,
          flagged: true,
        }),
      ];

      const state = hydrateSessionState(mockSession, mockQuestions.slice(0, 2), mockAttempts);

      expect(state.status).toBe("active");
      expect(state.responses["q1"].result).toBe("correct");
      expect(state.flagged.has("q1")).toBe(true);
      expect(state.timeRemaining).toBe(50000); // 60000 - 10000
    });

    it("should set status to completed if session state is completed", () => {
      const mockSession = makeSession({ state: "completed", mode: "untimed" });
      const state = hydrateSessionState(mockSession, [], []);
      expect(state.status).toBe("completed");
    });
  });
});
