import { describe, it, expect, vi, afterEach } from "vitest";
import worker, { runReminderSweep } from "./sync-worker.js";
import { bytesToBase64Url } from "./web-push.js";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function makeEnv({ kvStore = new Map(), vapid = true } = {}) {
  const env = {
    KV: {
      get: vi.fn(async (k) => (kvStore.has(k) ? kvStore.get(k) : null)),
      put: vi.fn(async (k, v) => void kvStore.set(k, v)),
      delete: vi.fn(async (k) => void kvStore.delete(k)),
      list: vi.fn(async ({ prefix }) => ({
        keys: [...kvStore.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      })),
    },
    RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
  };
  if (vapid) {
    env.VAPID_PUBLIC_KEY = "pub";
    env.VAPID_PRIVATE_KEY = "priv";
    env.VAPID_SUBJECT = "mailto:test@example.com";
  }
  return { env, kvStore };
}

function req(path, body) {
  return new Request(`https://sync.example.com${path}`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "1.2.3.4", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function realSubscription() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    endpoint: "https://push.example.com/dev-1",
    keys: { p256dh: bytesToBase64Url(rawPublic), auth: bytesToBase64Url(auth) },
  };
}

async function realVapid() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: bytesToBase64Url(rawPublic), privateKey: jwk.d };
}

describe("POST /push/subscribe", () => {
  it("stores a valid subscription under a push: key", async () => {
    const { env, kvStore } = makeEnv();
    const sub = await realSubscription();
    const res = await worker.fetch(req("/push/subscribe", { subscription: sub, time: "18:00", tzOffsetMinutes: 0 }), env);
    expect(res.status).toBe(200);
    const keys = [...kvStore.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0].startsWith("push:")).toBe(true);
    expect(JSON.parse(kvStore.get(keys[0])).time).toBe("18:00");
  });

  it("rejects an invalid reminder time", async () => {
    const { env } = makeEnv();
    const sub = await realSubscription();
    const res = await worker.fetch(req("/push/subscribe", { subscription: sub, time: "9pm", tzOffsetMinutes: 0 }), env);
    expect(res.status).toBe(400);
  });

  it("preserves lastSent when updating an existing device", async () => {
    const { env, kvStore } = makeEnv();
    const sub = await realSubscription();
    await worker.fetch(req("/push/subscribe", { subscription: sub, time: "18:00", tzOffsetMinutes: 0 }), env);
    const key = [...kvStore.keys()][0];
    kvStore.set(key, JSON.stringify({ ...JSON.parse(kvStore.get(key)), lastSent: "2024-01-01" }));

    await worker.fetch(req("/push/subscribe", { subscription: sub, time: "07:30", tzOffsetMinutes: 0 }), env);
    const record = JSON.parse(kvStore.get(key));
    expect(record.time).toBe("07:30");
    expect(record.lastSent).toBe("2024-01-01");
  });
});

describe("POST /push/unsubscribe", () => {
  it("deletes the stored subscription", async () => {
    const { env, kvStore } = makeEnv();
    const sub = await realSubscription();
    await worker.fetch(req("/push/subscribe", { subscription: sub, time: "18:00", tzOffsetMinutes: 0 }), env);
    expect(kvStore.size).toBe(1);
    const res = await worker.fetch(req("/push/unsubscribe", { endpoint: sub.endpoint }), env);
    expect(res.status).toBe(200);
    expect(kvStore.size).toBe(0);
  });
});

describe("runReminderSweep", () => {
  it("sends a due reminder and records lastSent", async () => {
    const { env, kvStore } = makeEnv();
    const v = await realVapid();
    env.VAPID_PUBLIC_KEY = v.publicKey;
    env.VAPID_PRIVATE_KEY = v.privateKey;
    const sub = await realSubscription();
    kvStore.set("push:abc", JSON.stringify({ subscription: sub, time: "13:00", tzOffsetMinutes: -60, lastSent: null }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    global.fetch = fetchMock;

    await runReminderSweep(env, Date.parse("2024-01-01T12:00:00Z")); // local 13:00
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(kvStore.get("push:abc")).lastSent).toBe("2024-01-01");
  });

  it("does not send when the reminder is not due", async () => {
    const { env, kvStore } = makeEnv();
    const v = await realVapid();
    env.VAPID_PUBLIC_KEY = v.publicKey;
    env.VAPID_PRIVATE_KEY = v.privateKey;
    const sub = await realSubscription();
    kvStore.set("push:abc", JSON.stringify({ subscription: sub, time: "13:00", tzOffsetMinutes: -60, lastSent: null }));
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await runReminderSweep(env, Date.parse("2024-01-01T06:00:00Z")); // local 07:00
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prunes a subscription the push service reports as gone (410)", async () => {
    const { env, kvStore } = makeEnv();
    const v = await realVapid();
    env.VAPID_PUBLIC_KEY = v.publicKey;
    env.VAPID_PRIVATE_KEY = v.privateKey;
    const sub = await realSubscription();
    kvStore.set("push:abc", JSON.stringify({ subscription: sub, time: "13:00", tzOffsetMinutes: -60, lastSent: null }));
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));

    await runReminderSweep(env, Date.parse("2024-01-01T12:00:00Z"));
    expect(kvStore.has("push:abc")).toBe(false);
  });

  it("skips the sweep entirely when VAPID keys are missing", async () => {
    const { env } = makeEnv({ vapid: false });
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    await runReminderSweep(env, Date.now());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
