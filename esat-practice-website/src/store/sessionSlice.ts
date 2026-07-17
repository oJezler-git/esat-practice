import { useEffect, useMemo } from "react";
import { create } from "zustand";
import {
  createInitialSessionState,
  getCurrentQuestion,
  hydrateSessionState,
  reduceSessionState,
} from "../engine/sessionEngine";
import { pickReplacementQuestions } from "../engine/sessionBuilder";
import { scoreSession } from "../engine/scorer";
import { createSessionTicker } from "../engine/timer";
import {
  getDerivedStoreState,
  getQuestionsByIdsFromDb,
  listQuestionsFromDb,
} from "../lib/questionStore";
import { useSettingsStore } from "../lib/settingsStore";
import {
  excludeQuestionInDb,
  getExcludedQuestionIdsFromDb,
  refreshExcludedQuestionsStore,
} from "../lib/excludedQuestionStore";
import {
  getAttemptsForSession,
  getFlaggedQuestionIds,
  getSessionById,
  markSessionAbandoned,
  markSessionCompleted,
  saveSessionAttempts,
  updateSessionCurrentIndex,
  updateSessionQuestionIds,
  upsertAttemptRecord,
} from "../lib/sessionStore";
import { recomputeAllStats } from "../lib/statsStore";
import { markPracticedToday } from "../lib/pushNotifications";
import { analyseNsaaDuplicates } from "../lib/questionDedup";
import { generateId } from "../lib/ids";
import { normalizeAttemptResult } from "../engine/result";
import type { SessionEngineState } from "../types/engine";
import type { Attempt, Question, SelfMarkResult, Session } from "../types/schema";

function ensureAttempt(
  state: SessionEngineState,
  question: Question,
  overrides: Partial<Attempt> = {},
): Attempt {
  const existing = state.responses[question.id];
  // Not normalizeResult: an attempt with no result yet stays "unanswered" rather
  // than becoming "skipped", so committing elapsed time on nav marks nothing.
  const result = normalizeAttemptResult(overrides.result ?? existing?.result);

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

/**
 * Drops the excluded questions and appends `replacements` so the session keeps
 * its configured length. The cursor follows the slot the excluded question left
 * behind, which is why the index is rebuilt from how many removals sat before it
 * rather than clamped after the fact.
 */
function excludeQuestionsFromState(
  state: SessionEngineState,
  questionIds: string[],
  replacements: Question[],
): SessionEngineState {
  const removedIds = new Set(questionIds);
  const removedBeforeCursor = state.questions.filter(
    (question, index) => index < state.currentIndex && removedIds.has(question.id),
  ).length;

  const nextQuestions = [
    ...state.questions.filter((question) => !removedIds.has(question.id)),
    ...replacements,
  ];
  const nextResponses = { ...state.responses };
  const nextFlagged = new Set(state.flagged);

  for (const questionId of removedIds) {
    delete nextResponses[questionId];
    nextFlagged.delete(questionId);
  }

  const nextCurrentIndex =
    nextQuestions.length === 0
      ? 0
      : Math.min(
          Math.max(0, state.currentIndex - removedBeforeCursor),
          nextQuestions.length - 1,
        );

  return {
    ...state,
    session: state.session
      ? {
          ...state.session,
          config: {
            ...state.session.config,
            question_ids: nextQuestions.map((question) => question.id),
            question_count: nextQuestions.length,
          },
        }
      : null,
    questions: nextQuestions,
    currentIndex: nextCurrentIndex,
    responses: nextResponses,
    flagged: nextFlagged,
    questionElapsed: 0,
  };
}

async function persistCurrentIndex(state: SessionEngineState): Promise<void> {
  if (!state.session) {
    return;
  }
  await updateSessionCurrentIndex(state.session.id, state.currentIndex);
}

/**
 * Picks questions to bring a session back up to its configured length, shared by
 * the two paths that can leave it short: excluding a question mid-session, and
 * resuming one whose questions went missing while it was unfinished.
 *
 * `rawQuestions` is the unfiltered bank. It gets narrowed to the pool
 * practice-setup builds from — the raw list still holds the NSAA duplicates the
 * bank hides and the subjects the user has switched off, neither of which could
 * have been in the session to begin with.
 */
async function pickTopUpQuestions(
  session: Session,
  rawQuestions: Question[],
  excludedQuestionIds: Set<string>,
  usedIds: Set<string>,
  count: number,
): Promise<Question[]> {
  if (count <= 0 || rawQuestions.length === 0) {
    return [];
  }

  let pool = getDerivedStoreState(
    rawQuestions,
    excludedQuestionIds,
    useSettingsStore.getState().settings.enabledSubjects,
  ).questions;

  // A flagged-only session must top up from flagged questions; the topic/year
  // filters alone would let an unflagged one in. Flags are read fresh rather
  // than snapshotted at session start, so anything flagged since is fair game.
  if (pool.length > 0 && session.config.flagged_only) {
    const flaggedIds = await getFlaggedQuestionIds();
    pool = pool.filter((candidate) => flaggedIds.has(candidate.id));
  }

  return pickReplacementQuestions(
    pool,
    { ...session.config, mode: session.mode },
    usedIds,
    count,
  );
}

interface SessionSlice extends SessionEngineState {
  notFound: boolean;
  /**
   * How many excluded questions this session could not replace, because the
   * question bank ran out of candidates matching its filters. Cumulative, so a
   * session that ends up short can say by how much rather than leaving the user
   * to wonder whether the top-up broke.
   */
  topUpShortfall: number;
  load: (sessionId: string) => Promise<void>;
  mark: (result: SelfMarkResult) => Promise<void>;
  flag: () => Promise<void>;
  skip: () => Promise<void>;
  excludeCurrentQuestion: (allQuestions?: Question[]) => Promise<void>;
  nav: (direction: "next" | "prev") => Promise<void>;
  jumpTo: (index: number) => Promise<void>;
  submit: () => Promise<void>;
  quit: () => Promise<void>;
  pause: () => Promise<void>;
  tick: (elapsedMs: number) => Promise<void>;
}

export const useSessionSlice = create<SessionSlice>((set, get) => {
// Guards against the submit persistence sequence running concurrently. submit()
// can be triggered by the timer auto-submit, a manual submit, and the
// exclude-last-question path; without this an in-flight submit could run twice.
let submitting = false;
return {
  ...createInitialSessionState(),
  notFound: false,
  topUpShortfall: 0,
  load: async (sessionId: string) => {
    set({ ...createInitialSessionState(), notFound: false, topUpShortfall: 0 });
    const session = await getSessionById(sessionId);
    if (!session) {
      set({ ...createInitialSessionState(), notFound: true });
      return;
    }

    const [questions, attempts, excludedQuestionIds] = await Promise.all([
      getQuestionsByIdsFromDb(session.config.question_ids),
      getAttemptsForSession(sessionId),
      getExcludedQuestionIdsFromDb(),
    ]);

    const includedQuestions = questions.filter(
      (question) => !excludedQuestionIds.has(question.id),
    );
    const includedAttempts = attempts.filter(
      (attempt) => !excludedQuestionIds.has(attempt.question_id),
    );

    // Questions can go missing while a session sits unfinished: excluded from
    // the question bank, auto-excluded by another session's results, or dropped
    // by a dataset version bump that changes ids. Top the session back up rather
    // than resuming it silently short. Only the bank read is deferred to this
    // path, since the common case drops nothing and should not pay for it.
    const droppedCount = session.config.question_ids.length - includedQuestions.length;
    let replacements: Question[] = [];
    if (droppedCount > 0 && session.state === "active") {
      replacements = await pickTopUpQuestions(
        session,
        await listQuestionsFromDb(),
        excludedQuestionIds,
        new Set([
          ...includedQuestions.map((question) => question.id),
          ...excludedQuestionIds,
        ]),
        droppedCount,
      );
    }

    const finalQuestions = [...includedQuestions, ...replacements];
    // The recorded position indexes the list as it was before anything dropped
    // out of it, so it has to shift back past whatever was removed ahead of it.
    const includedIds = new Set(includedQuestions.map((question) => question.id));
    const storedIndex = session.current_index ?? 0;
    const droppedBeforeCursor = session.config.question_ids.filter(
      (questionId, index) => index < storedIndex && !includedIds.has(questionId),
    ).length;
    const hydratedSession =
      droppedCount === 0
        ? session
        : {
            ...session,
            current_index: Math.max(0, storedIndex - droppedBeforeCursor),
            config: {
              ...session.config,
              question_ids: finalQuestions.map((question) => question.id),
              question_count: finalQuestions.length,
            },
          };

    if (droppedCount > 0) {
      await updateSessionQuestionIds(
        session.id,
        finalQuestions.map((question) => question.id),
      );
    }

    set({
      ...hydrateSessionState(hydratedSession, finalQuestions, includedAttempts),
      topUpShortfall: droppedCount - replacements.length,
    });
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
    await persistCurrentIndex(finalState);
  },
  excludeCurrentQuestion: async (allQuestions?: Question[]) => {
    const state = get();
    const question = getCurrentQuestion(state);
    if (!state.session || !question || state.status !== "active") {
      return;
    }

    const idsToExclude = [question.id];
    if (allQuestions) {
      const analysis = analyseNsaaDuplicates(allQuestions);
      for (const pair of analysis.excludedPairs) {
        if (pair.engaaQuestion.id === question.id) {
          idsToExclude.push(pair.nsaaQuestion.id);
        } else if (pair.nsaaQuestion.id === question.id) {
          idsToExclude.push(pair.engaaQuestion.id);
        }
      }
    }

    await Promise.all(idsToExclude.map((id) => excludeQuestionInDb(id)));
    // Sync the in-memory exclusion store, or the practice-setup page keeps
    // offering the excluded question until a full reload.
    await refreshExcludedQuestionsStore();
    const excludedQuestionIds = await getExcludedQuestionIdsFromDb();

    // Re-read after the awaits: a mark/flag/tick that landed while the DB
    // writes were in flight must not be clobbered by the stale snapshot.
    const latest = get();
    const removedCount = idsToExclude.filter((id) =>
      latest.questions.some((candidate) => candidate.id === id),
    ).length;
    const usedIds = new Set([
      ...latest.questions.map((candidate) => candidate.id),
      ...excludedQuestionIds,
    ]);
    const replacements = await pickTopUpQuestions(
      state.session,
      allQuestions ?? [],
      excludedQuestionIds,
      usedIds,
      removedCount,
    );

    const nextState = excludeQuestionsFromState(latest, idsToExclude, replacements);
    set({
      ...latest,
      ...nextState,
      topUpShortfall: latest.topUpShortfall + (removedCount - replacements.length),
    });

    await updateSessionQuestionIds(
      state.session.id,
      nextState.questions.map((candidate) => candidate.id),
    );
    // The removal shifts the cursor, so the recorded position has to move with
    // it or a resume would land on whatever slid into the old slot.
    await persistCurrentIndex(nextState);

    if (nextState.questions.length === 0) {
      await get().submit();
    }
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
    await persistCurrentIndex(navigated);
  },
  jumpTo: async (index: number) => {
    const state = get();
    if (state.status !== "active") {
      return;
    }

    const { nextState, committed } = commitQuestionElapsed(state);
    const jumped = {
      ...nextState,
      currentIndex: Math.max(
        0,
        Math.min(index, nextState.questions.length - 1),
      ),
      questionElapsed: 0,
    };
    set(jumped);

    if (committed) {
      await upsertAttemptRecord(committed);
    }
    await persistCurrentIndex(jumped);
  },
  submit: async () => {
    const state = get();
    if (!state.session || (state.status !== "active" && state.status !== "reviewing")) {
      return;
    }
    if (submitting) {
      return;
    }
    submitting = true;

    try {
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

      // Persist the durable source of truth first, then derive stats from it.
      await saveSessionAttempts(state.session.id, scored.attempts);
      await markSessionCompleted(state.session.id);
      void markPracticedToday();

      // Stats are recomputable from attempts, so a failure here must not block
      // completion — log and move on; the next recompute will self-heal.
      try {
        await recomputeAllStats();
      } catch (error) {
        console.error("Failed to recompute stats after submit", error);
      }

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
    } finally {
      submitting = false;
    }
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
  pause: async () => {
    const state = get();
    if (!state.session) {
      return;
    }

    const { nextState, committed } = commitQuestionElapsed(state);
    set(nextState);

    if (committed) {
      await upsertAttemptRecord(committed);
    }
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
  };
});

export function useSessionEngine(sessionId: string) {
  const notFound = useSessionSlice((state) => state.notFound);
  const topUpShortfall = useSessionSlice((state) => state.topUpShortfall);
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
  const excludeCurrentQuestion = useSessionSlice(
    (state) => state.excludeCurrentQuestion,
  );
  const nav = useSessionSlice((state) => state.nav);
  const jumpTo = useSessionSlice((state) => state.jumpTo);
  const submit = useSessionSlice((state) => state.submit);
  const quit = useSessionSlice((state) => state.quit);
  const pause = useSessionSlice((state) => state.pause);

  const currentQuestion = questions[currentIndex] ?? null;
  // "unanswered" surfaces as undefined: consumers treat a result as "the user has
  // marked this", which drives answer reveal and auto-advance.
  const storedResult = currentQuestion
    ? responses[currentQuestion.id]?.result
    : undefined;
  const currentAttemptResult: SelfMarkResult | undefined =
    storedResult === "unanswered" ? undefined : storedResult;
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
      notFound,
      topUpShortfall,
      status,
      session,
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
      excludeCurrentQuestion: (allQuestions?: Question[]) =>
        excludeCurrentQuestion(allQuestions),
      nav,
      jumpTo,
      submit,
      quit,
      pause,
      responses,
      questions,
    }),
    [
      notFound,
      topUpShortfall,
      currentAttemptResult,
      currentIndex,
      currentQuestion,
      flag,
      excludeCurrentQuestion,
      isFlagged,
      load,
      mark,
      nav,
      jumpTo,
      questions,
      responses,
      session,
      skip,
      status,
      submit,
      quit,
      pause,
      timeRemaining,
    ],
  );
}
