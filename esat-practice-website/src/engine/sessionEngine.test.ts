import { describe, it, expect } from "vitest";
import {
  createInitialSessionState,
  hydrateSessionState,
  reduceSessionState,
} from "./sessionEngine";
import type { Question } from "../types/schema";

describe("sessionEngine", () => {
  const mockQuestions: Question[] = [
    { id: "q1", taxonomy: { primary_topic: "T1" } } as any,
    { id: "q2", taxonomy: { primary_topic: "T2" } } as any,
    { id: "q3", taxonomy: { primary_topic: "T3" } } as any,
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

  describe("hydrateSessionState", () => {
    it("should correctly hydrate from session, questions and attempts", () => {
      const mockSession = {
        id: "s1",
        state: "active",
        mode: "timed",
        config: { time_limit_ms: 60000, question_ids: ["q1", "q2"] },
      } as any;
      const mockAttempts = [
        { question_id: "q1", result: "correct", time_ms: 10000, flagged: true },
      ] as any;

      const state = hydrateSessionState(mockSession, mockQuestions.slice(0, 2), mockAttempts);

      expect(state.status).toBe("active");
      expect(state.responses["q1"].result).toBe("correct");
      expect(state.flagged.has("q1")).toBe(true);
      expect(state.timeRemaining).toBe(50000); // 60000 - 10000
    });

    it("should set status to completed if session state is completed", () => {
      const mockSession = { state: "completed", mode: "untimed", config: {} } as any;
      const state = hydrateSessionState(mockSession, [], []);
      expect(state.status).toBe("completed");
    });
  });
});
