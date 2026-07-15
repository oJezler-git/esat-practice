import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getAttemptsForSession,
  createSessionRecord,
  getRecentSessions,
  getActiveSessions,
  getFlaggedQuestionIds,
  markSessionCompleted,
  markSessionAbandoned,
  sweepStaleActiveSessions,
} from "./sessionStore";
import { getDb } from "./db";

vi.mock("./db");

const SESSION_ID = "session-test-abc";

function createMockDb(opts: {
  attemptsForSession?: unknown[];
  session?: unknown;
  allSessions?: unknown[];
} = {}) {
  const sessionStoreInTx = {
    get: vi.fn().mockResolvedValue(opts.session ?? null),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const attemptStoreInTx = {
    put: vi.fn().mockResolvedValue(undefined),
  };
  const db = {
    getAllFromIndex: vi.fn().mockResolvedValue(opts.attemptsForSession ?? []),
    get: vi.fn().mockResolvedValue(opts.session ?? null),
    getAll: vi.fn().mockResolvedValue(opts.allSessions ?? []),
    put: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn((name: string) =>
        name === "sessions" ? sessionStoreInTx : attemptStoreInTx
      ),
      done: Promise.resolve(),
    }),
  };
  return { db, sessionStoreInTx, attemptStoreInTx };
}

function makeRawAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    question_id: "q-1",
    session_id: SESSION_ID,
    result: "correct",
    time_ms: 1000,
    flagged: false,
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAttemptsForSession — result normalisation", () => {
  it("passes through modern result values unchanged", async () => {
    for (const result of ["correct", "incorrect", "skipped"] as const) {
      const { db } = createMockDb({
        attemptsForSession: [makeRawAttempt({ result })],
        session: { id: SESSION_ID, attempt_ids: [] },
      });
      vi.mocked(getDb).mockResolvedValue(db as any);
      const attempts = await getAttemptsForSession(SESSION_ID);
      expect(attempts[0].result).toBe(result);
    }
  });

  it("normalises legacy correct:true to 'correct'", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ result: undefined, correct: true })],
      session: { id: SESSION_ID, attempt_ids: [] },
    });
    vi.mocked(getDb).mockResolvedValue(db as any);
    const attempts = await getAttemptsForSession(SESSION_ID);
    expect(attempts[0].result).toBe("correct");
  });

  it("normalises legacy correct:false to 'incorrect'", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ result: undefined, correct: false })],
      session: { id: SESSION_ID, attempt_ids: [] },
    });
    vi.mocked(getDb).mockResolvedValue(db as any);
    const attempts = await getAttemptsForSession(SESSION_ID);
    expect(attempts[0].result).toBe("incorrect");
  });

  it("normalises legacy selected:'SKIPPED' (uppercase) to 'skipped'", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ result: undefined, selected: "SKIPPED" })],
      session: { id: SESSION_ID, attempt_ids: [] },
    });
    vi.mocked(getDb).mockResolvedValue(db as any);
    const attempts = await getAttemptsForSession(SESSION_ID);
    expect(attempts[0].result).toBe("skipped");
  });

  // A missing result means the user never marked the question, which is distinct
  // from deliberately skipping it — reads keep it "unanswered" so a rehydrated
  // session can be returned to. Scoring is what folds it into "skipped".
  it("defaults a missing result to 'unanswered'", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ result: undefined })],
      session: { id: SESSION_ID, attempt_ids: [] },
    });
    vi.mocked(getDb).mockResolvedValue(db as any);
    const attempts = await getAttemptsForSession(SESSION_ID);
    expect(attempts[0].result).toBe("unanswered");
  });

  it("preserves a persisted 'unanswered' result", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ result: "unanswered" })],
      session: { id: SESSION_ID, attempt_ids: [] },
    });
    vi.mocked(getDb).mockResolvedValue(db as any);
    const attempts = await getAttemptsForSession(SESSION_ID);
    expect(attempts[0].result).toBe("unanswered");
  });

  it("defaults an unrecognised result to 'skipped'", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ result: "banana" })],
      session: { id: SESSION_ID, attempt_ids: [] },
    });
    vi.mocked(getDb).mockResolvedValue(db as any);
    const attempts = await getAttemptsForSession(SESSION_ID);
    expect(attempts[0].result).toBe("skipped");
  });

  it("filters out records with a missing id", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ id: undefined })],
      session: { id: SESSION_ID, attempt_ids: [] },
    });
    vi.mocked(getDb).mockResolvedValue(db as any);
    expect(await getAttemptsForSession(SESSION_ID)).toHaveLength(0);
  });

  it("filters out records with a missing question_id", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ question_id: undefined })],
      session: { id: SESSION_ID, attempt_ids: [] },
    });
    vi.mocked(getDb).mockResolvedValue(db as any);
    expect(await getAttemptsForSession(SESSION_ID)).toHaveLength(0);
  });
});

describe("getAttemptsForSession — ordering", () => {
  it("returns attempts in attempt_ids order when session has them", async () => {
    const a1 = makeRawAttempt({ id: "a1", question_id: "q-1", timestamp: 2000 });
    const a2 = makeRawAttempt({ id: "a2", question_id: "q-2", timestamp: 1000 });
    const session = { id: SESSION_ID, attempt_ids: ["a2", "a1"] };
    const { db } = createMockDb({ attemptsForSession: [a1, a2], session });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const attempts = await getAttemptsForSession(SESSION_ID);
    expect(attempts.map((a) => a.id)).toEqual(["a2", "a1"]);
  });

  it("falls back to ascending timestamp sort when session has no attempt_ids", async () => {
    const a1 = makeRawAttempt({ id: "a1", question_id: "q-1", timestamp: 2000 });
    const a2 = makeRawAttempt({ id: "a2", question_id: "q-2", timestamp: 1000 });
    const session = { id: SESSION_ID, attempt_ids: [] };
    const { db } = createMockDb({ attemptsForSession: [a1, a2], session });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const attempts = await getAttemptsForSession(SESSION_ID);
    expect(attempts.map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});

describe("getFlaggedQuestionIds", () => {
  function makeAttemptsDb(attempts: unknown[]) {
    return {
      getAll: vi.fn(async (store: string) => (store === "attempts" ? attempts : [])),
    };
  }

  it("returns question ids whose latest attempt is flagged", async () => {
    const db = makeAttemptsDb([
      makeRawAttempt({ id: "a1", question_id: "q-1", flagged: true }),
      makeRawAttempt({ id: "a2", question_id: "q-2", flagged: false }),
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const flagged = await getFlaggedQuestionIds();
    expect([...flagged]).toEqual(["q-1"]);
  });

  it("lets the most recent attempt win when a question is re-attempted", async () => {
    // Flagged in an old attempt, then unflagged in a newer one → not flagged.
    const db = makeAttemptsDb([
      makeRawAttempt({ id: "old", question_id: "q-1", flagged: true, timestamp: 1000 }),
      makeRawAttempt({ id: "new", question_id: "q-1", flagged: false, timestamp: 2000 }),
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    expect([...(await getFlaggedQuestionIds())]).toEqual([]);
  });

  it("flags a question when the newest attempt re-flags it", async () => {
    const db = makeAttemptsDb([
      makeRawAttempt({ id: "old", question_id: "q-1", flagged: false, timestamp: 1000 }),
      makeRawAttempt({ id: "new", question_id: "q-1", flagged: true, timestamp: 2000 }),
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    expect([...(await getFlaggedQuestionIds())]).toEqual(["q-1"]);
  });

  it("skips malformed attempt records", async () => {
    const db = makeAttemptsDb([
      makeRawAttempt({ id: undefined, question_id: "q-1", flagged: true }),
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    expect([...(await getFlaggedQuestionIds())]).toEqual([]);
  });
});

describe("createSessionRecord", () => {
  it("writes a session with the correct shape and returns it", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);

    const session = await createSessionRecord({
      mode: "untimed",
      question_ids: ["q1", "q2"],
      topic_filter: ["Algebra"],
    });

    expect(session.mode).toBe("untimed");
    expect(session.config.question_ids).toEqual(["q1", "q2"]);
    expect(session.config.topic_filter).toEqual(["Algebra"]);
    expect(session.state).toBe("active");
    expect(session.attempt_ids).toEqual([]);
    expect(typeof session.id).toBe("string");
    expect(typeof session.created_at).toBe("number");
    expect(db.put).toHaveBeenCalledWith("sessions", session);
  });
});

describe("getRecentSessions", () => {
  it("returns sessions sorted newest-first and capped at the limit", async () => {
    const sessions = [
      { id: "s1", created_at: 1000 },
      { id: "s2", created_at: 3000 },
      { id: "s3", created_at: 2000 },
    ];
    const { db } = createMockDb({ allSessions: sessions });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await getRecentSessions(2);
    expect(result.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("uses a default limit of 10", async () => {
    const sessions = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, created_at: i }));
    const { db } = createMockDb({ allSessions: sessions });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await getRecentSessions();
    expect(result).toHaveLength(10);
  });
});

describe("markSessionCompleted", () => {
  it("writes the session back with state 'completed' and a completed_at timestamp", async () => {
    const session = { id: SESSION_ID, state: "active", attempt_ids: [] };
    const { db } = createMockDb({ session });
    vi.mocked(getDb).mockResolvedValue(db as any);

    await markSessionCompleted(SESSION_ID);

    expect(db.put).toHaveBeenCalledWith(
      "sessions",
      expect.objectContaining({ state: "completed", completed_at: expect.any(Number) }),
    );
  });

  it("does nothing when the session does not exist", async () => {
    const { db } = createMockDb({ session: null });
    vi.mocked(getDb).mockResolvedValue(db as any);
    await markSessionCompleted("nonexistent");
    expect(db.put).not.toHaveBeenCalled();
  });
});

describe("markSessionAbandoned", () => {
  it("writes the session back with state 'abandoned' and a completed_at timestamp", async () => {
    const session = { id: SESSION_ID, state: "active", attempt_ids: [] };
    const { db } = createMockDb({ session });
    vi.mocked(getDb).mockResolvedValue(db as any);

    await markSessionAbandoned(SESSION_ID);

    expect(db.put).toHaveBeenCalledWith(
      "sessions",
      expect.objectContaining({ state: "abandoned", completed_at: expect.any(Number) }),
    );
  });

  it("does nothing when the session does not exist", async () => {
    const { db } = createMockDb({ session: null });
    vi.mocked(getDb).mockResolvedValue(db as any);
    await markSessionAbandoned("nonexistent");
    expect(db.put).not.toHaveBeenCalled();
  });
});

describe("getActiveSessions", () => {
  it("returns only sessions with state 'active', newest first", async () => {
    const sessions = [
      { id: "s1", created_at: 1000, state: "active" },
      { id: "s2", created_at: 3000, state: "completed" },
      { id: "s3", created_at: 2000, state: "active" },
      { id: "s4", created_at: 4000, state: "abandoned" },
    ];
    const { db } = createMockDb({ allSessions: sessions });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await getActiveSessions();
    expect(result.map((s) => s.id)).toEqual(["s3", "s1"]);
  });

  it("returns an empty array when there are no active sessions", async () => {
    const sessions = [{ id: "s1", created_at: 1000, state: "completed" }];
    const { db } = createMockDb({ allSessions: sessions });
    vi.mocked(getDb).mockResolvedValue(db as any);

    expect(await getActiveSessions()).toEqual([]);
  });
});

describe("sweepStaleActiveSessions", () => {
  const HOUR = 60 * 60 * 1000;

  function makeDb(sessions: Record<string, unknown>[], attemptsBySession: Record<string, unknown[]>) {
    const db = {
      getAll: vi.fn().mockResolvedValue(sessions),
      get: vi.fn(async (_store: string, id: string) => sessions.find((s) => s.id === id) ?? null),
      getAllFromIndex: vi.fn(async (_store: string, _index: string, sessionId: string) =>
        attemptsBySession[sessionId] ?? [],
      ),
      put: vi.fn().mockResolvedValue(undefined),
    };
    return db;
  }

  it("marks an active session as abandoned when its last attempt is older than the threshold", async () => {
    const now = Date.now();
    const session = { id: "s1", created_at: now - 10 * HOUR, state: "active" };
    const db = makeDb([session], { s1: [{ timestamp: now - 8 * HOUR }] });
    vi.mocked(getDb).mockResolvedValue(db as any);

    await sweepStaleActiveSessions(6 * HOUR);

    expect(db.put).toHaveBeenCalledWith(
      "sessions",
      expect.objectContaining({ id: "s1", state: "abandoned", completed_at: expect.any(Number) }),
    );
  });

  it("leaves an active session alone when it has recent attempt activity", async () => {
    const now = Date.now();
    const session = { id: "s1", created_at: now - 10 * HOUR, state: "active" };
    const db = makeDb([session], { s1: [{ timestamp: now - HOUR }] });
    vi.mocked(getDb).mockResolvedValue(db as any);

    await sweepStaleActiveSessions(6 * HOUR);

    expect(db.put).not.toHaveBeenCalled();
  });

  it("falls back to created_at when there are no attempts yet", async () => {
    const now = Date.now();
    const session = { id: "s1", created_at: now - 8 * HOUR, state: "active" };
    const db = makeDb([session], { s1: [] });
    vi.mocked(getDb).mockResolvedValue(db as any);

    await sweepStaleActiveSessions(6 * HOUR);

    expect(db.put).toHaveBeenCalledWith(
      "sessions",
      expect.objectContaining({ id: "s1", state: "abandoned" }),
    );
  });

  it("does not touch sessions that are already completed or abandoned", async () => {
    const now = Date.now();
    const sessions = [
      { id: "s1", created_at: now - 10 * HOUR, state: "completed" },
      { id: "s2", created_at: now - 10 * HOUR, state: "abandoned" },
    ];
    const db = makeDb(sessions, {});
    vi.mocked(getDb).mockResolvedValue(db as any);

    await sweepStaleActiveSessions(6 * HOUR);

    expect(db.put).not.toHaveBeenCalled();
  });
});
