import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { Attempt, Question, Session, TopicStat } from "../types/schema";

const DB_NAME = "esat-practice-db";
const DB_VERSION = 1;

interface EsatPracticeDB extends DBSchema {
  questions: {
    key: string;
    value: Question;
    indexes: {
      "by-topic": string;
      "by-paper": string;
      "by-year": number;
      "by-part": string;
    };
  };
  sessions: {
    key: string;
    value: Session;
    indexes: {
      "by-created-at": number;
      "by-state": Session["state"];
    };
  };
  attempts: {
    key: string;
    value: Attempt;
    indexes: {
      "by-question-id": string;
      "by-session-id": string;
      "by-timestamp": number;
    };
  };
  stats: {
    key: string;
    value: TopicStat;
    indexes: {
      "by-accuracy": number;
      "by-last-attempted": number;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<EsatPracticeDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<EsatPracticeDB>> {
  if (!databasePromise) {
    databasePromise = openDB<EsatPracticeDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("questions")) {
          const questionStore = database.createObjectStore("questions", {
            keyPath: "id",
          });
          questionStore.createIndex("by-topic", "taxonomy.primary_topic");
          questionStore.createIndex("by-paper", "source.paper");
          questionStore.createIndex("by-year", "source.year");
          questionStore.createIndex("by-part", "source.part");
        }

        if (!database.objectStoreNames.contains("sessions")) {
          const sessionStore = database.createObjectStore("sessions", {
            keyPath: "id",
          });
          sessionStore.createIndex("by-created-at", "created_at");
          sessionStore.createIndex("by-state", "state");
        }

        if (!database.objectStoreNames.contains("attempts")) {
          const attemptStore = database.createObjectStore("attempts", {
            keyPath: "id",
          });
          attemptStore.createIndex("by-question-id", "question_id");
          attemptStore.createIndex("by-session-id", "session_id");
          attemptStore.createIndex("by-timestamp", "timestamp");
        }

        if (!database.objectStoreNames.contains("stats")) {
          const statsStore = database.createObjectStore("stats", {
            keyPath: "topic",
          });
          statsStore.createIndex("by-accuracy", "accuracy");
          statsStore.createIndex("by-last-attempted", "last_attempted");
        }
      },
    });
  }

  return databasePromise;
}

export async function clearAllStores(): Promise<void> {
  const database = await getDb();
  const transaction = database.transaction(
    ["questions", "sessions", "attempts", "stats"],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("questions").clear(),
    transaction.objectStore("sessions").clear(),
    transaction.objectStore("attempts").clear(),
    transaction.objectStore("stats").clear(),
  ]);
  await transaction.done;
}

export type { EsatPracticeDB };
