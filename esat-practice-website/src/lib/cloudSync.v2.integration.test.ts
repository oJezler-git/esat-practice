import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { makeSession } from "../test-utils/factories";
import { applyExchangeResponse, buildExchangeRequest } from "./cloudSync";
import { clearAllStores, getDb } from "./db";
import type { SyncMetaRecord, SyncOutboxRecord } from "./db";

function meta(overrides: Partial<SyncMetaRecord> = {}): SyncMetaRecord {
  return {
    id: "state",
    deviceId: "device-1",
    key: "amber-forest-1234",
    epoch: 1,
    cursor: 4,
    dirtyAt: 1,
    lastSuccessfulSync: null,
    retryCount: 0,
    migrationComplete: true,
    ...overrides,
  };
}

describe("automatic sync v2 persistence", () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("esat-sync-key", "amber-forest-1234");
    await clearAllStores();
  });

  it("acknowledges only named mutations and keeps newer local intent over a remote change", async () => {
    const database = await getDb();
    const local = makeSession({ id: "s1", current_index: 3 });
    await database.put("sessions", local);
    await database.put("syncMeta", meta());
    const sent: SyncOutboxRecord = {
      mutationId: "m-sent",
      entity: "session",
      entityId: "s1",
      action: "upsert",
      value: makeSession({ id: "s1", current_index: 1 }),
      createdAt: 1,
    };
    const newer: SyncOutboxRecord = {
      mutationId: "m-newer",
      entity: "session",
      entityId: "s1",
      action: "upsert",
      value: local,
      createdAt: 2,
    };
    await database.put("syncOutbox", sent);
    await database.put("syncOutbox", newer);

    await applyExchangeResponse({
      version: 2,
      epoch: 1,
      cursor: 5,
      hasMore: false,
      reset: false,
      acceptedMutationIds: ["m-sent"],
      changes: [{
        mutationId: "remote",
        entity: "session",
        entityId: "s1",
        action: "upsert",
        value: makeSession({ id: "s1", current_index: 2 }),
        revision: 5,
        deviceId: "device-2",
        serverTimestamp: 5,
      }],
    });

    expect(await database.get("syncOutbox", "m-sent")).toBeUndefined();
    expect(await database.get("syncOutbox", "m-newer")).toEqual(newer);
    expect((await database.get("sessions", "s1"))?.current_index).toBe(3);
  });

  it("discards stale offline mutations when a reset advances the epoch", async () => {
    const database = await getDb();
    await database.put("syncMeta", meta());
    await database.put("sessions", makeSession({ id: "stale" }));
    await database.put("syncOutbox", {
      mutationId: "stale-mutation",
      entity: "session",
      entityId: "stale",
      action: "upsert",
      value: makeSession({ id: "stale" }),
      createdAt: 1,
    });

    await applyExchangeResponse({
      version: 2,
      epoch: 2,
      cursor: 0,
      hasMore: false,
      reset: true,
      acceptedMutationIds: [],
      snapshot: { sessions: [], attempts: [], excludedQuestions: [] },
    });

    expect(await database.getAll("sessions")).toEqual([]);
    expect(await database.getAll("syncOutbox")).toEqual([]);
    expect((await database.get("syncMeta", "state"))?.epoch).toBe(2);
  });

  it("preserves pending local intent for a same-epoch cursor reset", async () => {
    const database = await getDb();
    const local = makeSession({ id: "local", current_index: 2 });
    await database.put("syncMeta", meta());
    await database.put("sessions", local);
    await database.put("syncOutbox", {
      mutationId: "pending",
      entity: "session",
      entityId: "local",
      action: "upsert",
      value: local,
      createdAt: 1,
    });

    await applyExchangeResponse({
      version: 2,
      epoch: 1,
      cursor: 10,
      hasMore: false,
      reset: true,
      acceptedMutationIds: [],
      snapshot: { sessions: [], attempts: [], excludedQuestions: [] },
    });

    expect((await database.get("sessions", "local"))?.current_index).toBe(2);
    expect(await database.get("syncOutbox", "pending")).toBeDefined();
  });

  it("rejects epoch changes and cursor regression unless accompanied by a reset", async () => {
    const database = await getDb();
    await database.put("syncMeta", meta());
    const base = {
      version: 2 as const,
      hasMore: false,
      reset: false,
      acceptedMutationIds: [],
      changes: [],
    };

    await expect(applyExchangeResponse({ ...base, epoch: 2, cursor: 5 }))
      .rejects.toThrow(/epochs/);
    await expect(applyExchangeResponse({ ...base, epoch: 1, cursor: 3 }))
      .rejects.toThrow(/older sync cursor/);
    expect((await database.get("syncMeta", "state"))?.cursor).toBe(4);
  });

  it("validates a reset before acknowledging any durable mutations", async () => {
    const database = await getDb();
    await database.put("syncMeta", meta());
    await database.put("syncOutbox", {
      mutationId: "must-survive",
      entity: "session",
      entityId: "s1",
      action: "delete",
      createdAt: 1,
    });

    await expect(applyExchangeResponse({
      version: 2,
      epoch: 1,
      cursor: 5,
      hasMore: false,
      reset: true,
      acceptedMutationIds: ["must-survive"],
    })).rejects.toThrow(/valid snapshot/);

    expect(await database.get("syncOutbox", "must-survive")).toBeDefined();
  });

  it("builds bounded batches in durable creation order", async () => {
    const database = await getDb();
    await database.put("syncMeta", meta());
    for (const [mutationId, createdAt] of [["later", 20], ["first", 10]] as const) {
      await database.put("syncOutbox", {
        mutationId,
        entity: "session",
        entityId: mutationId,
        action: "delete",
        createdAt,
      });
    }

    const request = await buildExchangeRequest(1);
    expect(request.cursor).toBe(4);
    expect(request.mutations.map((mutation) => mutation.mutationId)).toEqual(["first"]);
  });
});
