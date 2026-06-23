import type { Attempt, ExcludedQuestion, Session, TopicStat } from "../types/schema";
import { getDb } from "./db";

export const SYNC_KEY_STORAGE_KEY = "esat-sync-key";
const LAST_PUSH_STORAGE_KEY = "esat-sync-last-push";

const ADJECTIVES = [
  "amber", "azure", "bold", "bright", "calm", "clear", "cool", "crisp",
  "dark", "deep", "dry", "fair", "fast", "firm", "flat", "free", "fresh",
  "gold", "grey", "hard", "high", "keen", "large", "lean", "light", "long",
  "loud", "low", "mild", "mint", "neat", "pale", "pink", "pure", "quick",
  "rich", "safe", "sharp", "slow", "soft", "still", "swift", "tall", "true",
  "warm", "wide", "wild", "wise", "bold", "brisk",
];

const NOUNS = [
  "ash", "bay", "brook", "cave", "cliff", "coast", "creek", "dawn", "dell",
  "dew", "dune", "dust", "fern", "fire", "flag", "flame", "flint", "foam",
  "fog", "ford", "gale", "glen", "glow", "haze", "hill", "lake", "leaf",
  "loch", "mist", "moon", "moor", "moss", "oak", "peak", "pine", "pool",
  "rain", "reef", "ridge", "river", "rock", "root", "sand", "shore", "sky",
  "snow", "star", "stone", "tide", "vale", "wave", "wood",
];

function pick<T>(arr: T[]): T {
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

interface SyncPayload {
  version: 1;
  exported_at: number;
  sessions: Session[];
  attempts: Attempt[];
  stats: TopicStat[];
  excludedQuestions: ExcludedQuestion[];
}

async function exportData(): Promise<SyncPayload> {
  const db = await getDb();
  const tx = db.transaction(["sessions", "attempts", "stats", "excludedQuestions"], "readonly");
  const [sessions, attempts, stats, excludedQuestions] = await Promise.all([
    tx.objectStore("sessions").getAll(),
    tx.objectStore("attempts").getAll(),
    tx.objectStore("stats").getAll(),
    tx.objectStore("excludedQuestions").getAll(),
  ]);
  return { version: 1, exported_at: Date.now(), sessions, attempts, stats, excludedQuestions };
}

async function importData(payload: SyncPayload): Promise<void> {
  if (payload.version !== 1) throw new Error(`Unsupported sync payload version: ${payload.version}`);
  const db = await getDb();
  const tx = db.transaction(["sessions", "attempts", "stats", "excludedQuestions"], "readwrite");
  await Promise.all([
    tx.objectStore("sessions").clear(),
    tx.objectStore("attempts").clear(),
    tx.objectStore("stats").clear(),
    tx.objectStore("excludedQuestions").clear(),
  ]);
  await Promise.all([
    ...payload.sessions.map((r) => tx.objectStore("sessions").put(r)),
    ...payload.attempts.map((r) => tx.objectStore("attempts").put(r)),
    ...payload.stats.map((r) => tx.objectStore("stats").put(r)),
    ...payload.excludedQuestions.map((r) => tx.objectStore("excludedQuestions").put(r)),
  ]);
  await tx.done;
}

function getApiUrl(): string {
  const url = import.meta.env.VITE_SYNC_API_URL as string | undefined;
  if (!url) throw new Error("VITE_SYNC_API_URL is not set. Deploy the Cloudflare Worker and add the URL to your .env.local.");
  return url.replace(/\/$/, "");
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
  await importData(payload);
}
