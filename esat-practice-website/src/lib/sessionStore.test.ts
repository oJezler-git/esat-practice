import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getAttemptsForSession,
  createSessionRecord,
  getRecentSessions,
  markSessionCompleted,
  markSessionAbandoned,
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

  it("defaults unknown/missing result to 'skipped'", async () => {
    const { db } = createMockDb({
      attemptsForSession: [makeRawAttempt({ result: undefined })],
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
