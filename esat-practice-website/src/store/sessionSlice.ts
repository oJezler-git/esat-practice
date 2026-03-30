import { useEffect, useMemo } from "react";
import { create } from "zustand";
import {
  createInitialSessionState,
  getCurrentQuestion,
  hydrateSessionState,
  reduceSessionState,
} from "../engine/sessionEngine";
import { scoreSession } from "../engine/scorer";
import { createSessionTicker } from "../engine/timer";
import { getQuestionsByIdsFromDb } from "../lib/questionStore";
import {
  getAttemptsForSession,
  getSessionById,
  markSessionAbandoned,
  markSessionCompleted,
  saveSessionAttempts,
  upsertAttemptRecord,
} from "../lib/sessionStore";
import { updateTopicStatsFromBreakdown } from "../lib/statsStore";
import type { SessionEngineState } from "../types/engine";
import type { Attempt, Question, SelfMarkResult } from "../types/schema";

function generateId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function normalizeResult(value: unknown): SelfMarkResult {
  if (value === "correct" || value === "incorrect" || value === "skipped") {
    return value;
  }
  return "skipped";
}

function ensureAttempt(
  state: SessionEngineState,
  question: Question,
  overrides: Partial<Attempt> = {},
): Attempt {
  const existing = state.responses[question.id];
  const result = normalizeResult(overrides.result ?? existing?.result);

  return {
    id: overrides.id ?? existing?.id ?? generateId(),
    question_id: question.id,
    session_id: overrides.session_id ?? existing?.session_id ?? state.session?.id ?? "",
    result,
    time_ms: overrides.time_ms ?? existing?.time_ms ?? 0,
    flagged: overrides.flagged ?? existing?.flagged ?? state.flagged.has(question.id),
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

function commitQuestionElapsed(
  state: SessionEngineState,
): { nextState: SessionEngineState; committed?: Attempt } {
  const question = getCurrentQuestion(state);
  if (!question || state.questionElapsed <= 0) {
    return { nextState: state };
  }

  const existing = state.responses[question.id];
  const committed = ensureAttempt(state, question, {
    time_ms: (existing?.time_ms ?? 0) + state.questionElapsed,
    flagged: state.flagged.has(question.id),
    timestamp: Date.now(),
  });

  return {
    nextState: {
      ...state,
      questionElapsed: 0,
      responses: {
        ...state.responses,
        [question.id]: committed,
      },
    },
    committed,
  };
}

interface SessionSlice extends SessionEngineState {
  load: (sessionId: string) => Promise<void>;
  mark: (result: SelfMarkResult) => Promise<void>;
  flag: () => Promise<void>;
  skip: () => Promise<void>;
  nav: (direction: "next" | "prev") => Promise<void>;
  submit: () => Promise<void>;
  quit: () => Promise<void>;
  tick: (elapsedMs: number) => Promise<void>;
}

const useSessionSlice = create<SessionSlice>((set, get) => ({
  ...createInitialSessionState(),
  load: async (sessionId: string) => {
    const session = await getSessionById(sessionId);
    if (!session) {
      set(createInitialSessionState());
      return;
    }

    const [questions, attempts] = await Promise.all([
      getQuestionsByIdsFromDb(session.config.question_ids),
      getAttemptsForSession(sessionId),
    ]);

    set(hydrateSessionState(session, questions, attempts));
  },
  mark: async (result: SelfMarkResult) => {
    const state = get();
    const question = getCurrentQuestion(state);
    if (!state.session || !question || state.status !== "active") {
      return;
    }

    const reduced = reduceSessionState(state, {
      type: "MARK",
      question_id: question.id,
      result,
    });
    const attempt = ensureAttempt(reduced, question, {
      result,
      flagged: reduced.flagged.has(question.id),
      timestamp: Date.now(),
    });

    set({
      ...reduced,
      responses: {
        ...reduced.responses,
        [question.id]: attempt,
      },
    });

    await upsertAttemptRecord(attempt);
  },
  flag: async () => {
    const state = get();
    const question = getCurrentQuestion(state);
    if (!state.session || !question || state.status !== "active") {
      return;
    }

    const reduced = reduceSessionState(state, {
      type: "FLAG",
      question_id: question.id,
    });
    const attempt = ensureAttempt(reduced, question, {
      flagged: reduced.flagged.has(question.id),
      timestamp: Date.now(),
    });

    set({
      ...reduced,
      responses: {
        ...reduced.responses,
        [question.id]: attempt,
      },
    });

    await upsertAttemptRecord(attempt);
  },
  skip: async () => {
    const state = get();
    const question = getCurrentQuestion(state);
    if (!state.session || !question || state.status !== "active") {
      return;
    }

    const { nextState, committed } = commitQuestionElapsed(state);
    const skippedState = reduceSessionState(nextState, {
      type: "SKIP",
      question_id: question.id,
    });
    const skippedAttempt = ensureAttempt(skippedState, question, {
      result: "skipped",
      flagged: skippedState.flagged.has(question.id),
      timestamp: Date.now(),
    });

    let finalState: SessionEngineState = {
      ...skippedState,
      responses: {
        ...skippedState.responses,
        [question.id]: skippedAttempt,
      },
      questionElapsed: 0,
    };

    if (finalState.currentIndex < finalState.questions.length - 1) {
      finalState = reduceSessionState(finalState, {
        type: "NAV",
        direction: "next",
      });
    }

    set(finalState);

    if (committed) {
      await upsertAttemptRecord(committed);
    }
    await upsertAttemptRecord(skippedAttempt);
  },
  nav: async (direction: "next" | "prev") => {
    const state = get();
    if (state.status !== "active") {
      return;
    }

    const { nextState, committed } = commitQuestionElapsed(state);
    const navigated = reduceSessionState(nextState, {
      type: "NAV",
      direction,
    });
    set(navigated);

    if (committed) {
      await upsertAttemptRecord(committed);
    }
  },
  submit: async () => {
    const state = get();
    if (!state.session || (state.status !== "active" && state.status !== "reviewing")) {
      return;
    }

    const { nextState, committed } = commitQuestionElapsed(state);
    const reviewing = reduceSessionState(nextState, {
      type: "SUBMIT",
    });
    set(reviewing);

    if (committed) {
      await upsertAttemptRecord(committed);
    }

    const scored = scoreSession(
      reviewing.questions,
      reviewing.responses,
      state.session.id,
    );

    await saveSessionAttempts(state.session.id, scored.attempts);
    await updateTopicStatsFromBreakdown(scored.topicBreakdown);
    await markSessionCompleted(state.session.id);

    const completedSession = await getSessionById(state.session.id);
    set({
      ...reviewing,
      status: "completed",
      session:
        completedSession ??
        {
          ...state.session,
          state: "completed",
          completed_at: Date.now(),
        },
      responses: Object.fromEntries(
        scored.attempts.map((attempt) => [attempt.question_id, attempt]),
      ),
      questionElapsed: 0,
    });
  },
  quit: async () => {
    const state = get();
    if (!state.session) {
      return;
    }

    await markSessionAbandoned(state.session.id);
    const reduced = reduceSessionState(state, { type: "QUIT" });
    set(reduced);
  },
  tick: async (elapsedMs: number) => {
    const state = get();
    if (state.status !== "active") {
      return;
    }

    const reduced = reduceSessionState(state, {
      type: "TICK",
      ms: elapsedMs,
    });
    set(reduced);

    if (reduced.status === "reviewing") {
      await get().submit();
    }
  },
}));

export function useSessionEngine(sessionId: string) {
  const status = useSessionSlice((state) => state.status);
  const session = useSessionSlice((state) => state.session);
  const questions = useSessionSlice((state) => state.questions);
  const responses = useSessionSlice((state) => state.responses);
  const currentIndex = useSessionSlice((state) => state.currentIndex);
  const timeRemaining = useSessionSlice((state) => state.timeRemaining);
  const flagged = useSessionSlice((state) => state.flagged);
  const load = useSessionSlice((state) => state.load);
  const mark = useSessionSlice((state) => state.mark);
  const flag = useSessionSlice((state) => state.flag);
  const skip = useSessionSlice((state) => state.skip);
  const nav = useSessionSlice((state) => state.nav);
  const submit = useSessionSlice((state) => state.submit);

  const currentQuestion = questions[currentIndex] ?? null;
  const currentAttemptResult = currentQuestion
    ? responses[currentQuestion.id]?.result
    : undefined;
  const isFlagged = currentQuestion ? flagged.has(currentQuestion.id) : false;

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void load(sessionId);
  }, [load, sessionId]);

  useEffect(() => {
    if (status !== "active") {
      return;
    }

    const ticker = createSessionTicker((elapsed) => {
      void useSessionSlice.getState().tick(elapsed);
    });
    ticker.start();
    return () => {
      ticker.stop();
    };
  }, [session?.id, status]);

  return useMemo(
    () => ({
      status,
      currentQuestion,
      currentIndex,
      totalCount: questions.length,
      timeRemaining,
      currentAttemptResult,
      isFlagged,
      load,
      mark,
      flag,
      skip,
      nav,
      submit,
    }),
    [
      currentAttemptResult,
      currentIndex,
      currentQuestion,
      flag,
      isFlagged,
      load,
      mark,
      nav,
      questions.length,
      skip,
      status,
      submit,
      timeRemaining,
    ],
  );
}
