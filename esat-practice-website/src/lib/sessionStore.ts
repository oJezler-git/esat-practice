import type {
  Attempt,
  Session,
  SessionConfig,
  SessionMode,
} from "../types/schema";
import { getDb } from "./db";
import { generateId } from "./ids";
import { normalizeAttemptResult } from "../engine/result";

export function normalizeAttemptRecord(value: unknown): Attempt | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : undefined;
  const questionId =
    typeof record.question_id === "string" ? record.question_id : undefined;
  const sessionId =
    typeof record.session_id === "string" ? record.session_id : undefined;
  if (!id || !questionId || !sessionId) {
    return null;
  }

  const legacySelected =
    typeof record.selected === "string" ? record.selected.toLowerCase() : undefined;
  const legacyCorrect =
    typeof record.correct === "boolean" ? record.correct : undefined;

  const result = normalizeAttemptResult(
    record.result ??
      (legacySelected === "skipped"
        ? "skipped"
        : legacyCorrect === true
          ? "correct"
          : legacyCorrect === false
            ? "incorrect"
            : undefined),
  );

  return {
    id,
    question_id: questionId,
    session_id: sessionId,
    result,
    time_ms: typeof record.time_ms === "number" ? record.time_ms : 0,
    flagged: Boolean(record.flagged),
    timestamp: typeof record.timestamp === "number" ? record.timestamp : Date.now(),
  };
}

export interface CreateSessionInput {
  mode: SessionMode;
  question_ids: string[];
  question_count?: number;
  time_limit_ms?: number;
  topic_filter?: string[];
  paper_filter?: string[];
  year_filter?: number[];
  flagged_only?: boolean;
}

function buildSessionConfig(input: CreateSessionInput): SessionConfig {
  return {
    question_ids: input.question_ids,
    question_count: input.question_count,
    time_limit_ms: input.time_limit_ms,
    topic_filter: input.topic_filter,
    paper_filter: input.paper_filter,
    year_filter: input.year_filter,
    flagged_only: input.flagged_only,
  };
}

export async function createSessionRecord(
  input: CreateSessionInput,
): Promise<Session> {
  const database = await getDb();
  const session: Session = {
    id: generateId(),
    created_at: Date.now(),
    mode: input.mode,
    config: buildSessionConfig(input),
    attempt_ids: [],
    state: "active",
  };
  await database.put("sessions", session);
  return session;
}

export async function getSessionById(sessionId: string): Promise<Session | null> {
  const database = await getDb();
  const session = await database.get("sessions", sessionId);
  return session ?? null;
}

export async function getRecentSessions(limit: number = 10): Promise<Session[]> {
  const database = await getDb();
  const sessions = await database.getAll("sessions");
  return sessions
    .sort((left, right) => right.created_at - left.created_at)
    .slice(0, limit);
}

export async function getAllSessions(): Promise<Session[]> {
  const database = await getDb();
  const sessions = await database.getAll("sessions");
  return sessions.sort((left, right) => right.created_at - left.created_at);
}

// Sessions left "active" past this age are treated as dead tabs rather than
// something the user still intends to resume.
export const SESSION_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

async function getLastActivityTimestamp(
  database: Awaited<ReturnType<typeof getDb>>,
  session: Session,
): Promise<number> {
  const attempts = await database.getAllFromIndex(
    "attempts",
    "by-session-id",
    session.id,
  );
  return attempts.reduce(
    (latest, attempt) => Math.max(latest, attempt.timestamp ?? 0),
    session.created_at,
  );
}

export async function getActiveSessions(): Promise<Session[]> {
  const sessions = await getAllSessions();
  return sessions.filter((session) => session.state === "active");
}

/**
 * Marks "active" sessions with no activity in the last `staleAfterMs` as
 * abandoned, so a closed tab doesn't leave a zombie session behind forever.
 */
export async function sweepStaleActiveSessions(
  staleAfterMs: number = SESSION_STALE_AFTER_MS,
): Promise<void> {
  const database = await getDb();
  const sessions = await database.getAll("sessions");
  const now = Date.now();

  // Each session's last-activity lookup is an independent read, and marking one
  // stale doesn't affect another — so fan the reads and writes out in parallel.
  const active = sessions.filter((session) => session.state === "active");
  const lastActivity = await Promise.all(
    active.map((session) => getLastActivityTimestamp(database, session)),
  );
  const stale = active.filter((_, index) => now - lastActivity[index] > staleAfterMs);
  await Promise.all(
    stale.map((session) =>
      database.put("sessions", {
        ...session,
        state: "abandoned",
        completed_at: now,
      }),
    ),
  );
}

export async function getAttemptsForSession(sessionId: string): Promise<Attempt[]> {
  const database = await getDb();
  const attemptsRaw = await database.getAllFromIndex(
    "attempts",
    "by-session-id",
    sessionId,
  );
  const attempts = attemptsRaw
    .map((attempt) => normalizeAttemptRecord(attempt))
    .filter((attempt): attempt is Attempt => Boolean(attempt));

  const session = await database.get("sessions", sessionId);

  if (session && session.attempt_ids.length > 0) {
    const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
    return session.attempt_ids
      .map((attemptId) => byId.get(attemptId))
      .filter((attempt): attempt is Attempt => Boolean(attempt));
  }

  return attempts.sort((left, right) => left.timestamp - right.timestamp);
}

/**
 * Returns the set of question IDs the user currently has flagged. A question
 * can be attempted across several sessions and the flag toggled each time, so
 * "currently flagged" is decided by the most recent attempt for that question.
 */
export async function getFlaggedQuestionIds(): Promise<Set<string>> {
  const database = await getDb();
  const attemptsRaw = await database.getAll("attempts");
  const latestByQuestion = new Map<string, Attempt>();

  for (const raw of attemptsRaw) {
    const attempt = normalizeAttemptRecord(raw);
    if (!attempt) {
      continue;
    }
    const existing = latestByQuestion.get(attempt.question_id);
    if (!existing || attempt.timestamp >= existing.timestamp) {
      latestByQuestion.set(attempt.question_id, attempt);
    }
  }

  const flagged = new Set<string>();
  for (const [questionId, attempt] of latestByQuestion) {
    if (attempt.flagged) {
      flagged.add(questionId);
    }
  }
  return flagged;
}

export async function upsertAttemptRecord(attempt: Attempt): Promise<void> {
  const database = await getDb();
  const transaction = database.transaction(["attempts", "sessions"], "readwrite");
  await transaction.objectStore("attempts").put(attempt);

  const sessionStore = transaction.objectStore("sessions");
  const session = await sessionStore.get(attempt.session_id);
  if (session && !session.attempt_ids.includes(attempt.id)) {
    session.attempt_ids = [...session.attempt_ids, attempt.id];
    await sessionStore.put(session);
  }
  await transaction.done;
}

export async function saveSessionAttempts(
  sessionId: string,
  attempts: Attempt[],
): Promise<void> {
  const database = await getDb();
  const transaction = database.transaction(["attempts", "sessions"], "readwrite");
  const attemptStore = transaction.objectStore("attempts");

  await Promise.all(attempts.map((attempt) => attemptStore.put(attempt)));

  const sessionStore = transaction.objectStore("sessions");
  const session = await sessionStore.get(sessionId);
  if (session) {
    session.attempt_ids = attempts.map((attempt) => attempt.id);
    await sessionStore.put(session);
  }

  await transaction.done;
}

export async function markSessionCompleted(sessionId: string): Promise<void> {
  const database = await getDb();
  const session = await database.get("sessions", sessionId);
  if (!session) {
    return;
  }

  await database.put("sessions", {
    ...session,
    state: "completed",
    completed_at: Date.now(),
  });
}

export async function markSessionAbandoned(sessionId: string): Promise<void> {
  const database = await getDb();
  const session = await database.get("sessions", sessionId);
  if (!session) {
    return;
  }

  await database.put("sessions", {
    ...session,
    state: "abandoned",
    completed_at: Date.now(),
  });
}

export async function updateSessionQuestionIds(
  sessionId: string,
  questionIds: string[],
): Promise<void> {
  const database = await getDb();
  const session = await database.get("sessions", sessionId);
  if (!session) {
    return;
  }

  await database.put("sessions", {
    ...session,
    config: {
      ...session.config,
      question_ids: questionIds,
      question_count: questionIds.length,
    },
  });
}

/**
 * Records the user's position so a resume returns them to it. Written on every
 * navigation, so it stays deliberately cheap: a single session put, no attempt
 * or stats work.
 */
export async function updateSessionCurrentIndex(
  sessionId: string,
  currentIndex: number,
): Promise<void> {
  const database = await getDb();
  const session = await database.get("sessions", sessionId);
  if (!session || session.current_index === currentIndex) {
    return;
  }

  await database.put("sessions", {
    ...session,
    current_index: currentIndex,
  });
}

const sessionStoreApi = {
  createSession: createSessionRecord,
  getSession: getSessionById,
  getAllSessions,
  getRecentSessions,
  getActiveSessions,
  getAttempts: getAttemptsForSession,
  getFlaggedQuestionIds,
  upsertAttempt: upsertAttemptRecord,
  saveAttempts: saveSessionAttempts,
  completeSession: markSessionCompleted,
  abandonSession: markSessionAbandoned,
  updateSessionQuestionIds,
  sweepStaleActiveSessions,
};

export function useSessionStore() {
  return sessionStoreApi;
}
