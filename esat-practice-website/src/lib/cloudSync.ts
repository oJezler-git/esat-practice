import type { Attempt, ExcludedQuestion, Session } from "../types/schema";
import { openDB } from "idb";
import { getDb } from "./db";
import type { SyncAction, SyncEntity, SyncMetaRecord, SyncOutboxRecord } from "./db";
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

// ---------------------------------------------------------------------------
// Automatic sync v2
// ---------------------------------------------------------------------------

export interface SyncMutation {
  mutationId: string;
  entity: SyncEntity;
  entityId: string;
  action: SyncAction;
  value?: Session | Attempt | ExcludedQuestion;
}

export interface SyncChange extends SyncMutation {
  revision: number;
  deviceId: string;
  serverTimestamp: number;
}

export interface SyncExchangeRequest {
  version: 2;
  deviceId: string;
  epoch: number | null;
  cursor: number | null;
  mutations: SyncMutation[];
}

export interface SyncExchangeResponse {
  version: 2;
  epoch: number;
  cursor: number;
  hasMore: boolean;
  reset: boolean;
  acceptedMutationIds: string[];
  changes?: SyncChange[];
  snapshot?: {
    sessions: Session[];
    attempts: Attempt[];
    excludedQuestions: ExcludedQuestion[];
  };
}

function validateExchangeResponse(response: SyncExchangeResponse): void {
  if (response.version !== 2) throw new Error(`Unsupported sync response version: ${response.version}`);
  if (!Number.isSafeInteger(response.epoch) || response.epoch < 0 ||
      !Number.isSafeInteger(response.cursor) || response.cursor < 0) {
    throw new Error("The server returned invalid sync metadata.");
  }
  if (!Array.isArray(response.acceptedMutationIds)) {
    throw new Error("The server returned an invalid acknowledgement list.");
  }
  if (response.reset && (!response.snapshot ||
      !Array.isArray(response.snapshot.sessions) ||
      !Array.isArray(response.snapshot.attempts) ||
      !Array.isArray(response.snapshot.excludedQuestions))) {
    throw new Error("Reset response did not include a valid snapshot.");
  }
  for (const change of response.changes ?? []) {
    if (!(["session", "attempt", "excludedQuestion"] as string[]).includes(change.entity) ||
        !(["upsert", "delete"] as string[]).includes(change.action) ||
        (change.action === "upsert" && change.value === undefined)) {
      throw new Error("The server returned an invalid sync change.");
    }
  }
}

export type SyncLocalWrite =
  | { entity: "session"; action: "upsert"; value: Session }
  | { entity: "session"; action: "delete"; entityId: string }
  | { entity: "attempt"; action: "upsert"; value: Attempt }
  | { entity: "attempt"; action: "delete"; entityId: string }
  | { entity: "excludedQuestion"; action: "upsert"; value: ExcludedQuestion }
  | { entity: "excludedQuestion"; action: "delete"; entityId: string };

export class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SyncHttpError";
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

const META_KEY = "state" as const;

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultSyncMeta(key: string | null): SyncMetaRecord {
  return {
    id: META_KEY,
    deviceId: randomId(),
    key,
    epoch: null,
    cursor: null,
    dirtyAt: null,
    lastSuccessfulSync: null,
    retryCount: 0,
    migrationComplete: false,
  };
}

export async function getSyncMeta(): Promise<SyncMetaRecord> {
  const database = await getDb();
  const stored = await database.get("syncMeta", META_KEY);
  const key = getSyncKey();
  if (stored && stored.key === key) return stored;

  const next = createDefaultSyncMeta(key);
  await database.put("syncMeta", next);
  return next;
}

export async function setSyncRetryCount(retryCount: number): Promise<void> {
  const database = await getDb();
  const transaction = database.transaction("syncMeta", "readwrite");
  const store = transaction.objectStore("syncMeta");
  const previous = await store.get(META_KEY);
  if (previous && previous.key === getSyncKey()) {
    await store.put({ ...previous, retryCount });
  }
  await transaction.done;
}

function localWriteIdentity(write: SyncLocalWrite): string {
  if ("entityId" in write) return write.entityId;
  if (write.entity === "excludedQuestion") return write.value.question_id;
  return write.value.id;
}

/** Build an outbox row for domain transactions that already update several stores. */
export function createSyncOutboxRecord(write: SyncLocalWrite, createdAt = Date.now()): SyncOutboxRecord {
  const entityId = localWriteIdentity(write);
  return {
    mutationId: randomId(),
    entity: write.entity,
    entityId,
    action: write.action,
    ...(write.action === "upsert" ? { value: write.value } : {}),
    createdAt,
  };
}

/** Call only after a domain transaction containing an outbox row has committed. */
export function notifySyncWriteCommitted(): void {
  if (getSyncKey()) window.dispatchEvent(new Event("esat-sync-dirty"));
}

/**
 * Applies source-of-truth writes and creates their durable outbox entries in
 * the same IDB transaction. Domain stores should use this once sync is wired.
 * With no connected key it remains a plain local write.
 */
export async function commitSyncWrites(writes: SyncLocalWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const database = await getDb();
  const connected = Boolean(getSyncKey());
  const storeNames = ["sessions", "attempts", "excludedQuestions"] as const;
  const transaction = database.transaction(
    connected ? [...storeNames, "syncOutbox", "syncMeta"] : [...storeNames],
    "readwrite",
  );
  const now = Date.now();

  for (const write of writes) {
    const entityId = localWriteIdentity(write);
    const storeName = write.entity === "session"
      ? "sessions"
      : write.entity === "attempt"
        ? "attempts"
        : "excludedQuestions";
    const store = transaction.objectStore(storeName);
    if (write.action === "delete") await store.delete(entityId);
    else await store.put(write.value as never);

    if (connected) {
      const record = createSyncOutboxRecord(write, now);
      await transaction.objectStore("syncOutbox").put(record);
    }
  }

  if (connected) {
    const metaStore = transaction.objectStore("syncMeta");
    const previous = await metaStore.get(META_KEY);
    await metaStore.put({
      ...(previous ?? createDefaultSyncMeta(getSyncKey())),
      key: getSyncKey(),
      dirtyAt: now,
    });
  }
  await transaction.done;
  if (connected) notifySyncWriteCommitted();
}

export async function queueInitialSyncSnapshot(): Promise<void> {
  const database = await getDb();
  const [sessions, attempts, exclusions] = await Promise.all([
    database.getAll("sessions"),
    database.getAll("attempts"),
    database.getAll("excludedQuestions"),
  ]);
  await commitSyncWrites([
    ...sessions.map((value): SyncLocalWrite => ({ entity: "session", action: "upsert", value })),
    ...attempts.map((value): SyncLocalWrite => ({ entity: "attempt", action: "upsert", value })),
    ...exclusions.map((value): SyncLocalWrite => ({ entity: "excludedQuestion", action: "upsert", value })),
  ]);
}

export async function exchangeWithCloud(
  key: string,
  request: SyncExchangeRequest,
): Promise<SyncExchangeResponse> {
  const response = await fetch(
    `${getApiUrl()}/sync/v2/${encodeURIComponent(key)}/exchange`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw new SyncHttpError((await response.text()) || `Sync failed (${response.status})`, response.status);
  }
  const result = await response.json() as SyncExchangeResponse;
  validateExchangeResponse(result);
  return result;
}

export async function buildExchangeRequest(limit = 250): Promise<SyncExchangeRequest> {
  const database = await getDb();
  const [meta, queued] = await Promise.all([
    getSyncMeta(),
    database.getAllFromIndex("syncOutbox", "by-created-at"),
  ]);
  return {
    version: 2,
    deviceId: meta.deviceId,
    epoch: meta.epoch,
    cursor: meta.cursor,
    mutations: queued.slice(0, limit).map(({ createdAt: _createdAt, ...mutation }) => mutation),
  };
}

function entityStore(entity: SyncEntity): "sessions" | "attempts" | "excludedQuestions" {
  if (entity === "session") return "sessions";
  if (entity === "attempt") return "attempts";
  return "excludedQuestions";
}

/** Applies server state, cursor advancement, and acknowledgements atomically. */
export async function applyExchangeResponse(response: SyncExchangeResponse): Promise<boolean> {
  // Validate before opening a write transaction: a malformed reset must never
  // acknowledge and discard outbox rows before failing.
  validateExchangeResponse(response);
  const database = await getDb();
  const transaction = database.transaction(
    ["sessions", "attempts", "excludedQuestions", "syncOutbox", "syncMeta"],
    "readwrite",
  );
  const outbox = transaction.objectStore("syncOutbox");
  const previousMeta = await transaction.objectStore("syncMeta").get(META_KEY);
  if (previousMeta?.epoch !== null && previousMeta?.epoch !== undefined &&
      previousMeta.epoch !== response.epoch && !response.reset) {
    throw new Error("The server changed sync epochs without providing a reset snapshot.");
  }
  if (!response.reset && previousMeta?.epoch === response.epoch &&
      previousMeta.cursor !== null && response.cursor < previousMeta.cursor) {
    throw new Error("The server returned an older sync cursor.");
  }
  for (const mutationId of response.acceptedMutationIds) await outbox.delete(mutationId);

  const epochWasCleared = previousMeta?.epoch !== null &&
    previousMeta?.epoch !== undefined &&
    previousMeta.epoch !== response.epoch;
  if (response.reset && epochWasCleared) await outbox.clear();
  const pending = await outbox.getAll();
  const pendingEntities = new Set(pending.map((item) => `${item.entity}:${item.entityId}`));
  let changed = false;

  if (response.reset) {
    const snapshots = response.snapshot!;
    await Promise.all([
      transaction.objectStore("sessions").clear(),
      transaction.objectStore("attempts").clear(),
      transaction.objectStore("excludedQuestions").clear(),
    ]);
    await Promise.all([
      ...snapshots.sessions.map((value) => transaction.objectStore("sessions").put(value)),
      ...snapshots.attempts.map((value) => transaction.objectStore("attempts").put(value)),
      ...snapshots.excludedQuestions.map((value) => transaction.objectStore("excludedQuestions").put(value)),
    ]);
    // Reapply unacknowledged local intent over the canonical reset snapshot.
    for (const item of pending) {
      const store = transaction.objectStore(entityStore(item.entity));
      if (item.action === "delete") await store.delete(item.entityId);
      else if (item.value) await store.put(item.value as never);
    }
    changed = true;
  } else {
    for (const change of response.changes ?? []) {
      if (pendingEntities.has(`${change.entity}:${change.entityId}`)) continue;
      const store = transaction.objectStore(entityStore(change.entity));
      if (change.action === "delete") await store.delete(change.entityId);
      else if (change.value) await store.put(change.value as never);
      changed = true;
    }
  }

  await transaction.objectStore("syncMeta").put({
    ...(previousMeta ?? createDefaultSyncMeta(getSyncKey())),
    key: getSyncKey(),
    epoch: response.epoch,
    cursor: response.cursor,
    dirtyAt: pending.length > 0 ? (previousMeta?.dirtyAt ?? Date.now()) : null,
    lastSuccessfulSync: Date.now(),
    retryCount: 0,
    migrationComplete: true,
  });
  await transaction.done;

  if (changed) window.dispatchEvent(new Event("esat-sync-data-changed"));
  return changed;
}

export async function clearCloudDocument(key: string): Promise<SyncExchangeResponse> {
  const meta = await getSyncMeta();
  const response = await fetch(`${getApiUrl()}/sync/v2/${encodeURIComponent(key)}/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: 2, deviceId: meta.deviceId, epoch: meta.epoch }),
  });
  if (!response.ok) throw new SyncHttpError(await response.text(), response.status);
  const result = await response.json() as SyncExchangeResponse;
  await applyExchangeResponse(result);
  return result;
}

export async function createRandomSyncKey(): Promise<string> {
  // The browser chooses only the memorable word pair. The server atomically
  // claims the numeric suffix, so two devices can never allocate the same key.
  return createSyncKeyWithWords(`${pick(ADJECTIVES)}-${pick(NOUNS)}`);
}
