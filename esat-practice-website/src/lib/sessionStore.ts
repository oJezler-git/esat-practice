import type {
  Attempt,
  SelfMarkResult,
  Session,
  SessionConfig,
  SessionMode,
} from "../types/schema";
import { getDb } from "./db";

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
  if (value === true) {
    return "correct";
  }
  if (value === false) {
    return "incorrect";
  }
  return "skipped";
}

function normalizeAttemptRecord(value: unknown): Attempt | null {
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

  const result = normalizeResult(
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
}

function buildSessionConfig(input: CreateSessionInput): SessionConfig {
  return {
    question_ids: input.question_ids,
    question_count: input.question_count,
    time_limit_ms: input.time_limit_ms,
    topic_filter: input.topic_filter,
    paper_filter: input.paper_filter,
    year_filter: input.year_filter,
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

  for (const attempt of attempts) {
    await attemptStore.put(attempt);
  }

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

const sessionStoreApi = {
  createSession: createSessionRecord,
  getSession: getSessionById,
  getRecentSessions,
  getAttempts: getAttemptsForSession,
  upsertAttempt: upsertAttemptRecord,
  saveAttempts: saveSessionAttempts,
  completeSession: markSessionCompleted,
  abandonSession: markSessionAbandoned,
};

export function useSessionStore() {
  return sessionStoreApi;
}
