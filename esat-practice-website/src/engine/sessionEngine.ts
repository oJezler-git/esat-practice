import type {
  EngineAction,
  SessionEngineState,
  SessionStatus,
} from "../types/engine";
import type { Attempt, Question, Session } from "../types/schema";

function currentQuestionId(state: SessionEngineState): string | undefined {
  return state.questions[state.currentIndex]?.id;
}

function cloneFlagged(flagged: Set<string>): Set<string> {
  return new Set(flagged);
}

function deriveStatus(session: Session | null): SessionStatus {
  if (!session) {
    return "idle";
  }
  if (session.state === "completed") {
    return "completed";
  }
  if (session.state === "abandoned") {
    return "abandoned";
  }
  return "active";
}

function createDraftAttempt(state: SessionEngineState, questionId: string): Attempt {
  return {
    id: `draft-${questionId}`,
    question_id: questionId,
    session_id: state.session?.id ?? "",
    result: "skipped",
    time_ms: 0,
    flagged: state.flagged.has(questionId),
    timestamp: Date.now(),
  };
}

export function createInitialSessionState(): SessionEngineState {
  return {
    status: "idle",
    session: null,
    questions: [],
    currentIndex: 0,
    responses: {},
    timeRemaining: undefined,
    questionElapsed: 0,
    flagged: new Set<string>(),
  };
}

export function hydrateSessionState(
  session: Session,
  questions: Question[],
  attempts: Attempt[],
): SessionEngineState {
  const responses = Object.fromEntries(
    attempts.map((attempt) => [attempt.question_id, attempt]),
  );
  const flagged = new Set(
    attempts.filter((attempt) => attempt.flagged).map((attempt) => attempt.question_id),
  );
  const consumedTime = attempts.reduce((sum, attempt) => sum + attempt.time_ms, 0);
  const initialTime =
    session.mode === "timed"
      ? Math.max(0, (session.config.time_limit_ms ?? 0) - consumedTime)
      : undefined;

  return {
    status: deriveStatus(session),
    session,
    questions,
    currentIndex: 0,
    responses,
    timeRemaining: initialTime,
    questionElapsed: 0,
    flagged,
  };
}

function clampIndex(index: number, totalCount: number): number {
  if (totalCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(totalCount - 1, index));
}

export function reduceSessionState(
  state: SessionEngineState,
  action: EngineAction,
): SessionEngineState {
  switch (action.type) {
    case "START":
      return {
        ...createInitialSessionState(),
        status: "configured",
        timeRemaining: action.config.time_limit_ms,
      };
    case "MARK": {
      const existing = state.responses[action.question_id] ?? createDraftAttempt(state, action.question_id);
      return {
        ...state,
        responses: {
          ...state.responses,
          [action.question_id]: {
            ...existing,
            result: action.result,
            flagged: state.flagged.has(action.question_id),
            timestamp: Date.now(),
          },
        },
      };
    }
    case "FLAG": {
      const nextFlagged = cloneFlagged(state.flagged);
      if (nextFlagged.has(action.question_id)) {
        nextFlagged.delete(action.question_id);
      } else {
        nextFlagged.add(action.question_id);
      }

      const existing = state.responses[action.question_id];
      return {
        ...state,
        flagged: nextFlagged,
        responses: existing
          ? {
              ...state.responses,
              [action.question_id]: {
                ...existing,
                flagged: nextFlagged.has(action.question_id),
                timestamp: Date.now(),
              },
            }
          : state.responses,
      };
    }
    case "SKIP": {
      const existing = state.responses[action.question_id] ?? createDraftAttempt(state, action.question_id);
      return {
        ...state,
        responses: {
          ...state.responses,
          [action.question_id]: {
            ...existing,
            result: "skipped",
            flagged: state.flagged.has(action.question_id),
            timestamp: Date.now(),
          },
        },
      };
    }
    case "NAV":
      return {
        ...state,
        currentIndex: clampIndex(
          action.direction === "next" ? state.currentIndex + 1 : state.currentIndex - 1,
          state.questions.length,
        ),
        questionElapsed: 0,
      };
    case "SUBMIT":
      return {
        ...state,
        status: "reviewing",
      };
    case "QUIT":
      return {
        ...state,
        status: "abandoned",
      };
    case "TICK": {
      if (state.status !== "active") {
        return state;
      }
      const nextElapsed = state.questionElapsed + action.ms;
      if (state.timeRemaining === undefined) {
        return {
          ...state,
          questionElapsed: nextElapsed,
        };
      }

      const nextRemaining = Math.max(0, state.timeRemaining - action.ms);
      return {
        ...state,
        status: nextRemaining === 0 ? "reviewing" : state.status,
        timeRemaining: nextRemaining,
        questionElapsed: nextElapsed,
      };
    }
    default:
      return state;
  }
}

export function getCurrentQuestion(
  state: SessionEngineState,
): Question | undefined {
  const questionId = currentQuestionId(state);
  if (!questionId) {
    return undefined;
  }
  return state.questions.find((question) => question.id === questionId);
}
