import { useSyncExternalStore } from "react";
import {
  applyExchangeResponse,
  buildExchangeRequest,
  clearCloudDocument,
  createRandomSyncKey as allocateRandomSyncKey,
  createSyncKeyWithWords as allocateSyncKeyWithWords,
  exchangeWithCloud,
  getSyncKey,
  getSyncMeta,
  queueInitialSyncSnapshot,
  saveLocalBackup,
  setSyncRetryCount,
  setSyncKey,
  SyncHttpError,
} from "./cloudSync";
import { getDb } from "./db";

export type SyncStatusKind = "disconnected" | "syncing" | "saved" | "offline" | "error";
export interface SyncStatus {
  status: SyncStatusKind;
  lastSyncedAt: number | null;
  error: string | null;
}

const RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000, 60_000, 300_000];
const LEASE_KEY = "esat-sync-lease";
const SYNC_EVENT_KEY = "esat-sync-event";
const LEASE_MS = 15_000;
const TAB_ID = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

let status: SyncStatus = {
  status: getSyncKey() ? (navigator.onLine ? "saved" : "offline") : "disconnected",
  lastSyncedAt: null,
  error: null,
};
const listeners = new Set<() => void>();
const dataListeners = new Set<() => void>();
let dataRevision = 0;
let running: Promise<void> | null = null;
let debounceTimer: number | undefined;
let retryTimer: number | undefined;
let pollTimer: number | undefined;
let leaseTimer: number | undefined;
let lastExchangeAt = 0;
let retryCount = 0;
let started = false;
let channel: BroadcastChannel | null = null;
let followUpNeeded = false;
let connectionRevision = 0;

function emit(next: SyncStatus): void {
  status = next;
  listeners.forEach((listener) => listener());
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}

function notifyDataChanged(): void {
  dataRevision += 1;
  dataListeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent("esat-sync-data-revision", { detail: dataRevision }));
}

export function useSyncDataRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      dataListeners.add(listener);
      return () => dataListeners.delete(listener);
    },
    () => dataRevision,
    () => 0,
  );
}

function leaseAvailable(): boolean {
  try {
    const raw = localStorage.getItem(LEASE_KEY);
    if (!raw) return true;
    const lease = JSON.parse(raw) as { tabId?: string; expiresAt?: number };
    return lease.tabId === TAB_ID || !lease.expiresAt || lease.expiresAt < Date.now();
  } catch {
    return true;
  }
}

function renewLease(): boolean {
  if (document.visibilityState === "hidden" || !leaseAvailable()) return false;
  localStorage.setItem(LEASE_KEY, JSON.stringify({ tabId: TAB_ID, expiresAt: Date.now() + LEASE_MS }));
  return true;
}

function ownsLease(): boolean {
  try {
    const lease = JSON.parse(localStorage.getItem(LEASE_KEY) ?? "null") as {
      tabId?: string;
      expiresAt?: number;
    } | null;
    return lease?.tabId === TAB_ID && Boolean(lease.expiresAt && lease.expiresAt >= Date.now());
  } catch {
    return false;
  }
}

function releaseLease(): void {
  try {
    const lease = JSON.parse(localStorage.getItem(LEASE_KEY) ?? "null") as { tabId?: string } | null;
    if (lease?.tabId === TAB_ID) localStorage.removeItem(LEASE_KEY);
  } catch {
    localStorage.removeItem(LEASE_KEY);
  }
}

async function refreshDerivedData(): Promise<void> {
  const [{ refreshExcludedQuestionsStore }, { recomputeAllStats }] = await Promise.all([
    import("./excludedQuestionStore"),
    import("./statsStore"),
  ]);
  await Promise.all([refreshExcludedQuestionsStore(), recomputeAllStats()]);
}

async function scheduleRetry(): Promise<void> {
  window.clearTimeout(retryTimer);
  const base = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
  const jitter = 0.8 + Math.random() * 0.4;
  retryCount += 1;
  await setSyncRetryCount(retryCount);
  retryTimer = window.setTimeout(() => void syncNow("retry"), Math.round(base * jitter));
}

export async function syncNow(reason = "manual"): Promise<void> {
  if (running) return running;
  const key = getSyncKey();
  if (!key) {
    emit({ status: "disconnected", lastSyncedAt: null, error: null });
    return;
  }
  if (!navigator.onLine) {
    emit({ ...status, status: "offline", error: null });
    return;
  }
  if (reason === "hidden") {
    if (!ownsLease()) return;
  } else if (reason !== "manual" && !renewLease()) return;
  const revisionAtStart = connectionRevision;

  running = (async () => {
    emit({ ...status, status: "syncing", error: null });
    try {
      const initialMeta = await getSyncMeta();
      retryCount = initialMeta.retryCount;
      if (!initialMeta.migrationComplete) {
        const database = await getDb();
        if (await database.count("syncOutbox") === 0) await queueInitialSyncSnapshot();
      }
      let changed = false;
      let more = true;
      let pages = 0;
      while (more && pages < 100) {
        const request = await buildExchangeRequest();
        const response = await exchangeWithCloud(key, request);
        if (connectionRevision !== revisionAtStart || getSyncKey() !== key) return;
        if (response.hasMore && response.cursor === request.cursor) {
          throw new Error("Sync pagination did not advance the cursor.");
        }
        changed = (await applyExchangeResponse(response)) || changed;
        more = response.hasMore;
        pages += 1;
      }
      if (more) throw new Error("Sync response exceeded the pagination safety limit.");
      if (changed) {
        await refreshDerivedData();
        notifyDataChanged();
      }
      retryCount = 0;
      lastExchangeAt = Date.now();
      const meta = await getSyncMeta();
      const database = await getDb();
      followUpNeeded = (await database.count("syncOutbox")) > 0;
      emit({ status: "saved", lastSyncedAt: meta.lastSuccessfulSync, error: null });
      channel?.postMessage({ type: "synced", at: meta.lastSuccessfulSync });
      localStorage.setItem(SYNC_EVENT_KEY, JSON.stringify({
        tabId: TAB_ID,
        at: meta.lastSuccessfulSync,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      emit({ ...status, status: "error", error: message });
      const retryable = !(error instanceof SyncHttpError) || error.retryable;
      if (retryable && document.visibilityState !== "hidden") await scheduleRetry();
    } finally {
      running = null;
      if (followUpNeeded) {
        followUpNeeded = false;
        window.setTimeout(() => void syncNow("follow-up"), 0);
      }
    }
  })();
  return running;
}

export function markSyncDirty(_reason = "local-write"): void {
  if (!getSyncKey()) return;
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    const remaining = Math.max(0, 5_000 - (Date.now() - lastExchangeAt));
    debounceTimer = window.setTimeout(() => void syncNow("dirty"), remaining);
  }, 1_500);
}

async function initialiseConnection(key: string, force = false): Promise<void> {
  const normalized = key.trim();
  if (!normalized) throw new Error("Enter a sync key.");
  const previous = getSyncKey();
  if (force || previous !== normalized) {
    connectionRevision += 1;
    if (running) await running;
    await saveLocalBackup();
    setSyncKey(normalized);
    const database = await getDb();
    const transaction = database.transaction(["syncMeta", "syncOutbox"], "readwrite");
    await Promise.all([
      transaction.objectStore("syncMeta").clear(),
      transaction.objectStore("syncOutbox").clear(),
    ]);
    await transaction.done;
    await queueInitialSyncSnapshot();
  }
  await syncNow("manual");
}

export async function connectSyncKey(key: string): Promise<void> {
  await initialiseConnection(key);
}

export async function createRandomSyncKey(): Promise<string> {
  const key = await allocateRandomSyncKey();
  await initialiseConnection(key, true);
  return key;
}

export async function createSyncKeyWithWords(words: string): Promise<string> {
  const key = await allocateSyncKeyWithWords(words);
  await initialiseConnection(key, true);
  return key;
}

export async function disconnectSync(): Promise<void> {
  connectionRevision += 1;
  localStorage.removeItem("esat-sync-key");
  if (running) await running;
  releaseLease();
  const database = await getDb();
  const transaction = database.transaction(["syncMeta", "syncOutbox"], "readwrite");
  await Promise.all([
    transaction.objectStore("syncMeta").clear(),
    transaction.objectStore("syncOutbox").clear(),
  ]);
  await transaction.done;
  emit({ status: "disconnected", lastSyncedAt: null, error: null });
}

export async function clearSyncedPracticeData(): Promise<void> {
  const key = getSyncKey();
  if (!key) throw new Error("Sync is not connected.");
  await clearCloudDocument(key);
  await refreshDerivedData();
  notifyDataChanged();
  channel?.postMessage({ type: "synced", at: Date.now() });
}

function onOnline(): void { void syncNow("online"); }
function onOffline(): void { emit({ ...status, status: "offline", error: null }); }
function onFocus(): void { void syncNow("focus"); }
function onVisibility(): void {
  if (document.visibilityState === "visible") void syncNow("visible");
  else {
    void syncNow("hidden");
    releaseLease();
  }
}
function onDirty(): void {
  markSyncDirty();
  channel?.postMessage({ type: "dirty" });
  localStorage.setItem(SYNC_EVENT_KEY, JSON.stringify({
    type: "dirty",
    tabId: TAB_ID,
    at: Date.now(),
  }));
}
function onStorage(event: StorageEvent): void {
  if (event.key === "esat-sync-key") {
    emit({ status: getSyncKey() ? "saved" : "disconnected", lastSyncedAt: status.lastSyncedAt, error: null });
  } else if (event.key === SYNC_EVENT_KEY && event.newValue) {
    try {
      const syncEvent = JSON.parse(event.newValue) as { type?: string; tabId?: string; at?: number };
      if (syncEvent.tabId === TAB_ID) return;
      if (syncEvent.type === "dirty") {
        void syncNow("peer-dirty");
        return;
      }
      emit({ status: "saved", lastSyncedAt: syncEvent.at ?? null, error: null });
      void refreshDerivedData().then(notifyDataChanged);
    } catch {
      // Ignore malformed events written by older or unrelated clients.
    }
  }
}

export function startSyncCoordinator(): () => void {
  if (started) return () => undefined;
  started = true;
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("esat-sync-dirty", onDirty);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibility);
  if ("BroadcastChannel" in globalThis) {
    channel = new BroadcastChannel("esat-sync");
    channel.addEventListener("message", (event) => {
      if (event.data?.type === "synced") {
        emit({ status: "saved", lastSyncedAt: event.data.at ?? null, error: null });
        void refreshDerivedData().then(notifyDataChanged);
      }
      if (event.data?.type === "dirty") void syncNow("peer-dirty");
    });
  }
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void syncNow("poll");
  }, 60_000);
  leaseTimer = window.setInterval(() => { renewLease(); }, LEASE_MS / 2);
  if (getSyncKey()) void syncNow("startup");

  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("esat-sync-dirty", onDirty);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearTimeout(debounceTimer);
    window.clearTimeout(retryTimer);
    window.clearInterval(pollTimer);
    window.clearInterval(leaseTimer);
    channel?.close();
    channel = null;
    releaseLease();
  };
}
