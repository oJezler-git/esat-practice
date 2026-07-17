import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disableReminders,
  enableReminders,
  getPermissionState,
  isPushSupported,
  requestPermission,
} from "./pushNotifications";

vi.mock("./cloudSync", () => ({ getApiUrl: () => "https://api.test" }));

const realFetch = global.fetch;

function teardownSupport() {
  delete (globalThis as Record<string, unknown>).PushManager;
  delete (globalThis as Record<string, unknown>).Notification;
  if ("serviceWorker" in navigator) {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  }
}

afterEach(() => {
  global.fetch = realFetch;
  teardownSupport();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("when push is unsupported", () => {
  it("reports unsupported and refuses to enable", async () => {
    expect(isPushSupported()).toBe(false);
    expect(getPermissionState()).toBe("unsupported");
    await expect(enableReminders("18:00")).rejects.toThrow(/not supported/i);
    await expect(requestPermission()).resolves.toBe("unsupported");
    // disable is a safe no-op when unsupported
    await expect(disableReminders()).resolves.toBeUndefined();
  });
});

describe("when push is supported", () => {
  let subscribe: ReturnType<typeof vi.fn>;
  let getSubscription: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;
  const fakeSubscription = {
    endpoint: "https://push.example.com/dev-1",
    toJSON: () => ({ endpoint: "https://push.example.com/dev-1", keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "BPk_valid_base64url");
    unsubscribe = fakeSubscription.unsubscribe;
    subscribe = vi.fn().mockResolvedValue(fakeSubscription);
    getSubscription = vi.fn().mockResolvedValue(null);

    (globalThis as Record<string, unknown>).PushManager = class PushManager {};
    (globalThis as Record<string, unknown>).Notification = {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
      },
    });
    global.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
  });

  it("detects support and reads permission state", () => {
    expect(isPushSupported()).toBe(true);
    expect(getPermissionState()).toBe("granted");
  });

  it("subscribes and posts the reminder time + tz offset", async () => {
    await enableReminders("07:30");
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.test/push/subscribe");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.time).toBe("07:30");
    expect(typeof body.tzOffsetMinutes).toBe("number");
    expect(body.subscription.endpoint).toBe(fakeSubscription.endpoint);
  });

  it("reuses an existing subscription instead of resubscribing", async () => {
    getSubscription.mockResolvedValue(fakeSubscription);
    await enableReminders("07:30");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("throws when permission is not granted", async () => {
    (globalThis as Record<string, unknown>).Notification = { permission: "denied" };
    await expect(enableReminders("07:30")).rejects.toThrow(/permission/i);
  });

  it("unsubscribes on the server and in the browser", async () => {
    getSubscription.mockResolvedValue(fakeSubscription);
    await disableReminders();
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.test/push/unsubscribe");
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("requests permission when undecided", async () => {
    (globalThis as Record<string, unknown>).Notification = {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };
    await expect(requestPermission()).resolves.toBe("granted");
  });
});
