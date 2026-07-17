import type { Attempt, ExcludedQuestion, Session } from "../types/schema";
import { openDB } from "idb";
import { getDb } from "./db";
import { ADJECTIVES, NOUNS } from "./syncWordList";

export { ADJECTIVES, NOUNS } from "./syncWordList";
export { validateWordPair } from "./syncWordList";

export const SYNC_KEY_STORAGE_KEY = "esat-sync-key";
const LAST_PUSH_STORAGE_KEY = "esat-sync-last-push";
const LAST_PULL_STORAGE_KEY = "esat-sync-last-pull";
const BACKUP_RECORD_KEY = "last-pull" as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSyncKey(): string {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const key = `${pick(ADJECTIVES)}-${pick(NOUNS)}-${digits}`;
  localStorage.setItem(SYNC_KEY_STORAGE_KEY, key);
  return key;
}

export function getSyncKey(): string | null {
  return localStorage.getItem(SYNC_KEY_STORAGE_KEY);
}

export function setSyncKey(key: string): void {
  localStorage.setItem(SYNC_KEY_STORAGE_KEY, key.trim());
}

export function getLastPush(): number | null {
  const raw = localStorage.getItem(LAST_PUSH_STORAGE_KEY);
  return raw ? Number(raw) : null;
}

export function getLastPull(): number | null {
  const raw = localStorage.getItem(LAST_PULL_STORAGE_KEY);
  return raw ? Number(raw) : null;
}

interface SyncPayload {
  version: 1;
  exported_at: number;
  sessions: Session[];
  attempts: Attempt[];
  excludedQuestions: ExcludedQuestion[];
}

// ---------------------------------------------------------------------------
// Pre-pull backup — stored in a separate IDB database so the main DB schema
// version never needs to be bumped for this concern.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let backupDbPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBackupDb(): Promise<any> {
  if (!backupDbPromise) {
    backupDbPromise = openDB("esat-backup-db", 1, {
      upgrade(db) {
        db.createObjectStore("backups", { keyPath: "id" });
      },
    });
  }
  return backupDbPromise;
}

export async function saveLocalBackup(): Promise<void> {
  const [payload, db] = await Promise.all([exportData(), getBackupDb()]);
  await db.put("backups", { id: BACKUP_RECORD_KEY, payload });
}

async function loadLocalBackup(): Promise<SyncPayload | null> {
  const db = await getBackupDb();
  const record = await db.get("backups", BACKUP_RECORD_KEY) as { id: string; payload: SyncPayload } | undefined;
  return record?.payload ?? null;
}

export async function hasLocalBackup(): Promise<boolean> {
  const db = await getBackupDb();
  const record = await db.get("backups", BACKUP_RECORD_KEY);
  return record !== undefined;
}

export async function clearLastBackup(): Promise<void> {
  const db = await getBackupDb();
  await db.delete("backups", BACKUP_RECORD_KEY);
}

/** Restore local data to exactly the pre-pull snapshot. Destructive by design — the user is explicitly undoing the last pull. */
export async function restoreLastBackup(): Promise<void> {
  const payload = await loadLocalBackup();
  if (!payload) throw new Error("No backup found.");
  const db = await getDb();
  const tx = db.transaction(["sessions", "attempts", "excludedQuestions"], "readwrite");
  await Promise.all([
    tx.objectStore("sessions").clear(),
    tx.objectStore("attempts").clear(),
    tx.objectStore("excludedQuestions").clear(),
  ]);
  await Promise.all([
    ...payload.sessions.map((r) => tx.objectStore("sessions").put(r)),
    ...payload.attempts.map((r) => tx.objectStore("attempts").put(r)),
    ...payload.excludedQuestions.map((r) => tx.objectStore("excludedQuestions").put(r)),
  ]);
  await tx.done;
  localStorage.removeItem(LAST_PULL_STORAGE_KEY);
  await clearLastBackup();
}

// ---------------------------------------------------------------------------
// Core data import / export
// ---------------------------------------------------------------------------

async function exportData(): Promise<SyncPayload> {
  const db = await getDb();
  const tx = db.transaction(["sessions", "attempts", "excludedQuestions"], "readonly");
  const [sessions, attempts, excludedQuestions] = await Promise.all([
    tx.objectStore("sessions").getAll(),
    tx.objectStore("attempts").getAll(),
    tx.objectStore("excludedQuestions").getAll(),
  ]);
  return { version: 1, exported_at: Date.now(), sessions, attempts, excludedQuestions };
}

/**
 * Merge cloud payload into local IDB — never deletes local records.
 *
 * sessions / attempts : add cloud records missing locally; local wins on ID conflict.
 * excludedQuestions   : union — excluded on either side stays excluded.
 *
 * `stats`/`categoryStats`/`sessionSummaries` are intentionally not synced: they're
 * derived stores rebuilt from `attempts` on every app start (see statsAggregator),
 * so syncing attempts is sufficient.
 */
async function importData(payload: SyncPayload): Promise<void> {
  if (payload.version !== 1) throw new Error(`Unsupported sync payload version: ${payload.version}`);
  const db = await getDb();
  const tx = db.transaction(["sessions", "attempts", "excludedQuestions"], "readwrite");

  const [localSessions, localAttempts] = await Promise.all([
    tx.objectStore("sessions").getAll(),
    tx.objectStore("attempts").getAll(),
  ]);

  const sessionIds = new Set(localSessions.map((s) => s.id));
  const attemptIds = new Set(localAttempts.map((a) => a.id));

  const puts: Promise<unknown>[] = [];

  for (const s of payload.sessions) {
    if (!sessionIds.has(s.id)) puts.push(tx.objectStore("sessions").put(s));
  }
  for (const a of payload.attempts) {
    if (!attemptIds.has(a.id)) puts.push(tx.objectStore("attempts").put(a));
  }
  for (const eq of payload.excludedQuestions) {
    puts.push(tx.objectStore("excludedQuestions").put(eq));
  }

  await Promise.all(puts);
  await tx.done;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getApiUrl(): string {
  const url = import.meta.env.VITE_SYNC_API_URL as string | undefined;
  if (!url) throw new Error("VITE_SYNC_API_URL is not set. Deploy the Cloudflare Worker and add the URL to your .env.local.");
  return url.replace(/\/$/, "");
}

export async function createSyncKeyWithWords(words: string): Promise<string> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/sync/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words: words.trim() }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = (await response.json()) as { key: string };
  if (!data.key) throw new Error("Server returned no key.");
  localStorage.setItem(SYNC_KEY_STORAGE_KEY, data.key);
  return data.key;
}

export async function pushToCloud(key: string): Promise<void> {
  const apiUrl = getApiUrl();
  const payload = await exportData();
  const response = await fetch(`${apiUrl}/sync/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  localStorage.setItem(LAST_PUSH_STORAGE_KEY, String(Date.now()));
}

export async function pullFromCloud(key: string): Promise<void> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/sync/${encodeURIComponent(key)}`);
  if (response.status === 404) throw new Error("No data found for this key. Have you pushed from another device yet?");
  if (!response.ok) throw new Error(await response.text());
  const payload = (await response.json()) as SyncPayload;
  if (payload.version !== 1) throw new Error(`Unsupported sync payload version: ${payload.version}`);
  await saveLocalBackup();
  await importData(payload);
  localStorage.setItem(LAST_PULL_STORAGE_KEY, String(Date.now()));
}
