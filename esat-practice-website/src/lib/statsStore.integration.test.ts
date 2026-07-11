/**
 * Stats store against real IndexedDB semantics (fake-indexeddb): read/write
 * paths and the recomputeAllStats derivation from the attempts store.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCategoryStats,
  getSessionSummaries,
  getTopicStat,
  getTopicStats,
  recomputeAllStats,
  upsertTopicStat,
} from "./statsStore";
import { clearAllStores, getDb } from "./db";
import { makeAttempt, makeQuestion, makeSession } from "../test-utils/factories";

beforeEach(async () => {
  await clearAllStores();
});

describe("topic stat reads and writes", () => {
  it("upserts and reads a topic stat back by key", async () => {
    await upsertTopicStat({
      topic: "Algebra",
      attempts: 4,
      correct: 3,
      accuracy: 0.75,
      ewma_accuracy: 0.8,
      last_attempted: 111,
    });

    expect((await getTopicStat("Algebra"))?.correct).toBe(3);
    expect(await getTopicStat("Unknown")).toBeNull();
  });

  it("lists topic stats sorted alphabetically", async () => {
    for (const topic of ["Mechanics", "Algebra", "Geometry"]) {
      await upsertTopicStat({
        topic,
        attempts: 1,
        correct: 1,
        accuracy: 1,
        ewma_accuracy: 1,
        last_attempted: 1,
      });
    }

    const stats = await getTopicStats();
    expect(stats.map((stat) => stat.topic)).toEqual(["Algebra", "Geometry", "Mechanics"]);
  });
});

describe("recomputeAllStats", () => {
  async function seedCompletedSession(): Promise<void> {
    const database = await getDb();
    await database.put(
      "questions",
      makeQuestion({
        id: "q-alg",
        source: { subject: "Mathematics", paper: "ENGAA 2022" },
        taxonomy: { primary_topic: "Algebra" },
      }),
    );
    await database.put(
      "questions",
      makeQuestion({
        id: "q-mech",
        source: { subject: "Physics", paper: "NSAA 2021" },
        taxonomy: { primary_topic: "Mechanics" },
      }),
    );
    await database.put(
      "sessions",
      makeSession({
        id: "s-done",
        state: "completed",
        completed_at: 1_000,
        config: { question_ids: ["q-alg", "q-mech"] },
      }),
    );
    await database.put(
      "attempts",
      makeAttempt({ id: "a1", question_id: "q-alg", session_id: "s-done", result: "correct" }),
    );
    await database.put(
      "attempts",
      makeAttempt({ id: "a2", question_id: "q-mech", session_id: "s-done", result: "incorrect" }),
    );
  }

  it("derives topic, category, and session-summary stores from attempts", async () => {
    await seedCompletedSession();

    await recomputeAllStats();

    const topics = await getTopicStats();
    expect(topics.map((stat) => stat.topic)).toEqual(["Algebra", "Mechanics"]);

    const subjects = await getCategoryStats("subject");
    expect(subjects.map((stat) => stat.key).sort()).toEqual(["Mathematics", "Physics"]);
    // Weakest-first ordering by EWMA accuracy.
    expect(subjects[0].key).toBe("Physics");

    const allCategories = await getCategoryStats();
    const dimensions = new Set(allCategories.map((stat) => stat.dimension));
    expect(dimensions).toEqual(new Set(["subject", "program", "paper"]));

    const summaries = await getSessionSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      session_id: "s-done",
      attempts: 2,
      correct: 1,
      accuracy: 0.5,
    });
  });

  it("is idempotent: rerunning never double-counts", async () => {
    await seedCompletedSession();

    await recomputeAllStats();
    await recomputeAllStats();

    const topics = await getTopicStats();
    expect(topics.find((stat) => stat.topic === "Algebra")?.attempts).toBe(1);
    expect(await getSessionSummaries()).toHaveLength(1);
  });
});
