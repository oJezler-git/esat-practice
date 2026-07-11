/**
 * Exercises the schema against a real IndexedDB implementation
 * (fake-indexeddb): records round-trip through every store, indexes answer
 * queries, and version upgrades preserve source-of-truth data while clearing
 * derived stores.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { openDB } from "idb";
import { clearAllStores, getDb, upgradeDatabase } from "./db";
import type { EsatPracticeDB } from "./db";
import { makeAttempt, makeQuestion, makeSession } from "../test-utils/factories";

let dbCounter = 0;

function openFreshDb(version = 4) {
  dbCounter += 1;
  return openDB<EsatPracticeDB>(`db-test-${dbCounter}`, version, {
    upgrade: upgradeDatabase,
  });
}

describe("schema round-trips", () => {
  it("stores and retrieves records in every object store by key", async () => {
    const database = await openFreshDb();

    const question = makeQuestion({ id: "q-round" });
    const session = makeSession({ id: "s-round" });
    const attempt = makeAttempt({ id: "a-round", session_id: "s-round" });

    await database.put("questions", question);
    await database.put("sessions", session);
    await database.put("attempts", attempt);
    await database.put("stats", {
      topic: "Algebra",
      attempts: 3,
      correct: 2,
      accuracy: 2 / 3,
      ewma_accuracy: 0.7,
      last_attempted: 123,
    });
    await database.put("categoryStats", {
      id: "subject::Mathematics",
      dimension: "subject",
      key: "Mathematics",
      attempts: 3,
      correct: 2,
      accuracy: 2 / 3,
      ewma_accuracy: 0.7,
      last_attempted: 123,
      total_time_ms: 3000,
      timed_attempts: 2,
      avg_time_ms: 1500,
      median_time_ms: 1500,
    });
    await database.put("sessionSummaries", {
      session_id: "s-round",
      mode: "untimed",
      completed_at: 456,
      attempts: 2,
      correct: 1,
      skipped: 1,
      accuracy: 0.5,
      total_time_ms: 2000,
      avg_time_ms: 1000,
      median_time_ms: 1000,
    });
    await database.put("excludedQuestions", {
      question_id: "q-round",
      excluded_at: 789,
    });

    expect(await database.get("questions", "q-round")).toEqual(question);
    expect(await database.get("sessions", "s-round")).toEqual(session);
    expect(await database.get("attempts", "a-round")).toEqual(attempt);
    expect((await database.get("stats", "Algebra"))?.attempts).toBe(3);
    expect((await database.get("categoryStats", "subject::Mathematics"))?.key).toBe(
      "Mathematics",
    );
    expect((await database.get("sessionSummaries", "s-round"))?.accuracy).toBe(0.5);
    expect((await database.get("excludedQuestions", "q-round"))?.excluded_at).toBe(789);
  });

  it("answers index queries used by the app", async () => {
    const database = await openFreshDb();

    await database.put(
      "questions",
      makeQuestion({ id: "q-alg", taxonomy: { primary_topic: "Algebra" } }),
    );
    await database.put(
      "questions",
      makeQuestion({ id: "q-mech", taxonomy: { primary_topic: "Mechanics" } }),
    );
    await database.put("attempts", makeAttempt({ id: "a1", session_id: "s1" }));
    await database.put("attempts", makeAttempt({ id: "a2", session_id: "s1" }));
    await database.put("attempts", makeAttempt({ id: "a3", session_id: "s2" }));

    const algebra = await database.getAllFromIndex("questions", "by-topic", "Algebra");
    expect(algebra.map((question) => question.id)).toEqual(["q-alg"]);

    const sessionAttempts = await database.getAllFromIndex(
      "attempts",
      "by-session-id",
      "s1",
    );
    expect(sessionAttempts.map((attempt) => attempt.id).sort()).toEqual(["a1", "a2"]);
  });
});

describe("upgrades", () => {
  it("clears derived stats stores on upgrade but keeps source-of-truth data", async () => {
    dbCounter += 1;
    const name = `db-test-${dbCounter}`;

    const v3 = await openDB<EsatPracticeDB>(name, 3, { upgrade: upgradeDatabase });
    await v3.put("questions", makeQuestion({ id: "q-keep" }));
    await v3.put("attempts", makeAttempt({ id: "a-keep" }));
    await v3.put("stats", {
      topic: "Stale",
      attempts: 1,
      correct: 1,
      accuracy: 1,
      ewma_accuracy: 1,
      last_attempted: 1,
    });
    v3.close();

    const v4 = await openDB<EsatPracticeDB>(name, 4, { upgrade: upgradeDatabase });

    // Derived rows are rebuilt on startup, so the upgrade wipes them...
    expect(await v4.getAll("stats")).toEqual([]);
    // ...while the stores they are derived from survive.
    expect((await v4.get("questions", "q-keep"))?.id).toBe("q-keep");
    expect((await v4.get("attempts", "a-keep"))?.id).toBe("a-keep");
  });
});

describe("clearAllStores", () => {
  beforeEach(async () => {
    // getDb() is a module-level singleton, so these tests share one database;
    // clearing keeps them independent.
    await clearAllStores();
  });

  it("empties every store", async () => {
    const database = await getDb();
    await database.put("questions", makeQuestion({ id: "q-clear" }));
    await database.put("sessions", makeSession({ id: "s-clear" }));
    await database.put("attempts", makeAttempt({ id: "a-clear" }));
    await database.put("excludedQuestions", { question_id: "q-clear", excluded_at: 1 });

    await clearAllStores();

    expect(await database.count("questions")).toBe(0);
    expect(await database.count("sessions")).toBe(0);
    expect(await database.count("attempts")).toBe(0);
    expect(await database.count("excludedQuestions")).toBe(0);
    expect(await database.count("stats")).toBe(0);
    expect(await database.count("categoryStats")).toBe(0);
    expect(await database.count("sessionSummaries")).toBe(0);
  });
});
