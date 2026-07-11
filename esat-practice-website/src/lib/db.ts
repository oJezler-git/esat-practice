import { openDB } from "idb";
import type { DBSchema, IDBPDatabase, OpenDBCallbacks } from "idb";
import type {
  Attempt,
  CategoryStat,
  ExcludedQuestion,
  Question,
  Session,
  SessionSummary,
  StatDimension,
  TopicStat,
} from "../types/schema";

const DB_NAME = "esat-practice-db";
const DB_VERSION = 4;

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
  categoryStats: {
    key: string;
    value: CategoryStat;
    indexes: {
      "by-dimension": StatDimension;
      "by-accuracy": number;
    };
  };
  sessionSummaries: {
    key: string;
    value: SessionSummary;
    indexes: {
      "by-completed-at": number;
    };
  };
  excludedQuestions: {
    key: string;
    value: ExcludedQuestion;
    indexes: {
      "by-excluded-at": number;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<EsatPracticeDB>> | null = null;

export const upgradeDatabase: NonNullable<
  OpenDBCallbacks<EsatPracticeDB>["upgrade"]
> = (database, _oldVersion, _newVersion, transaction) => {
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
  } else {
    // Stats are now derived from the attempts store and rebuilt on startup.
    transaction.objectStore("stats").clear();
  }

  if (!database.objectStoreNames.contains("categoryStats")) {
    const categoryStatsStore = database.createObjectStore("categoryStats", {
      keyPath: "id",
    });
    categoryStatsStore.createIndex("by-dimension", "dimension");
    categoryStatsStore.createIndex("by-accuracy", "accuracy");
  } else {
    transaction.objectStore("categoryStats").clear();
  }

  if (!database.objectStoreNames.contains("sessionSummaries")) {
    const sessionSummariesStore = database.createObjectStore(
      "sessionSummaries",
      { keyPath: "session_id" },
    );
    sessionSummariesStore.createIndex("by-completed-at", "completed_at");
  } else {
    transaction.objectStore("sessionSummaries").clear();
  }

  if (!database.objectStoreNames.contains("excludedQuestions")) {
    const excludedQuestionsStore = database.createObjectStore(
      "excludedQuestions",
      { keyPath: "question_id" },
    );
    excludedQuestionsStore.createIndex("by-excluded-at", "excluded_at");
  }
};

export function getDb(): Promise<IDBPDatabase<EsatPracticeDB>> {
  if (!databasePromise) {
    databasePromise = openDB<EsatPracticeDB>(DB_NAME, DB_VERSION, {
      upgrade: upgradeDatabase,
    });
  }

  return databasePromise;
}

export async function clearAllStores(): Promise<void> {
  const database = await getDb();
  const transaction = database.transaction(
    [
      "questions",
      "sessions",
      "attempts",
      "stats",
      "categoryStats",
      "sessionSummaries",
      "excludedQuestions",
    ],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("questions").clear(),
    transaction.objectStore("sessions").clear(),
    transaction.objectStore("attempts").clear(),
    transaction.objectStore("stats").clear(),
    transaction.objectStore("categoryStats").clear(),
    transaction.objectStore("sessionSummaries").clear(),
    transaction.objectStore("excludedQuestions").clear(),
  ]);
  await transaction.done;
}

export type { EsatPracticeDB };
