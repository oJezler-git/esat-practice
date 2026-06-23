/**
 * Data management utilities for clearing user data
 */

export interface ClearDataOptions {
  indexedDb?: boolean;
  localStorage?: boolean;
  sessions?: boolean;
  stats?: boolean;
}

/**
 * Clears all user data (nuclear option)
 */
export async function clearAllData(): Promise<void> {
  // Delete IndexedDB
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) {
      indexedDB.deleteDatabase(db.name);
    }
  }

  // Clear localStorage
  localStorage.clear();

  // Clear session storage
  sessionStorage.clear();
}

/**
 * Clear only progress/session data, keep settings
 */
export async function clearProgressData(): Promise<void> {
  // Delete IndexedDB
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) {
      indexedDB.deleteDatabase(db.name);
    }
  }

  // Remove specific localStorage keys (progress, sessions, stats)
  const keysToRemove = [
    "esat-practice:question-data-state",
    "esat-practice:sessions",
    "esat-practice:stats",
    "persistent_storage",
  ];

  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
  });

  // Clear session storage
  sessionStorage.clear();
}

/**
 * Generate random confirmation phrase (3 words)
 */
const WORDS = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
  "mike",
  "november",
  "oscar",
  "papa",
  "quebec",
  "romeo",
  "sierra",
  "tango",
  "uniform",
  "victor",
  "whiskey",
  "xray",
  "yankee",
  "zulu",
];

export function generateConfirmationPhrase(): string {
  return Array.from({ length: 3 })
    .map(() => WORDS[Math.floor(Math.random() * WORDS.length)])
    .join(" ");
}
