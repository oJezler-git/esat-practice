import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDecision,
  saveGranted,
  saveNever,
  saveRemindLater,
  checkAlreadyPersisted,
  requestPersist,
  isSupported,
} from "./persistentStorage";

const KEY = "persistent_storage";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getDecision", () => {
  it('returns "undecided" when nothing is stored', () => {
    expect(getDecision()).toBe("undecided");
  });

  it('returns "granted" when the stored value is "granted"', () => {
    localStorage.setItem(KEY, "granted");
    expect(getDecision()).toBe("granted");
  });

  it('returns "never" when the stored value is "never"', () => {
    localStorage.setItem(KEY, "never");
    expect(getDecision()).toBe("never");
  });

  it('returns "snoozed" for a future remind: date', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem(KEY, `remind:${future}`);
    expect(getDecision()).toBe("snoozed");
  });

  it('returns "undecided" for an expired remind: date', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    localStorage.setItem(KEY, `remind:${past}`);
    expect(getDecision()).toBe("undecided");
  });

  it('returns "undecided" for a malformed remind: date', () => {
    localStorage.setItem(KEY, "remind:not-a-date");
    expect(getDecision()).toBe("undecided");
  });

  it('returns "undecided" for an unrecognised stored value', () => {
    localStorage.setItem(KEY, "something-else");
    expect(getDecision()).toBe("undecided");
  });
});

describe("saveGranted", () => {
  it('writes "granted" so getDecision returns "granted"', () => {
    saveGranted();
    expect(getDecision()).toBe("granted");
  });
});

describe("saveNever", () => {
  it('writes "never" so getDecision returns "never"', () => {
    saveNever();
    expect(getDecision()).toBe("never");
  });
});

describe("saveRemindLater", () => {
  it('causes getDecision to return "snoozed" immediately after', () => {
    saveRemindLater();
    expect(getDecision()).toBe("snoozed");
  });

  it("sets the snooze expiry 7 days in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));

    saveRemindLater();

    const stored = localStorage.getItem(KEY)!;
    const until = new Date(stored.slice("remind:".length));
    expect(until.getTime()).toBe(new Date("2024-06-08T00:00:00.000Z").getTime());
  });

  it('returns "undecided" after the snooze window expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
    saveRemindLater();

    // Advance time past the 7-day snooze
    vi.setSystemTime(new Date("2024-06-09T00:00:00.000Z"));
    expect(getDecision()).toBe("undecided");
  });
});

describe("isSupported", () => {
  it("returns true when navigator.storage has both persist and persisted", () => {
    vi.stubGlobal("navigator", {
      storage: { persist: vi.fn(), persisted: vi.fn() },
    });
    expect(isSupported()).toBe(true);
  });

  it("returns false when navigator.storage is absent", () => {
    vi.stubGlobal("navigator", { storage: undefined });
    expect(isSupported()).toBe(false);
  });

  it("returns false when only one method is available", () => {
    vi.stubGlobal("navigator", { storage: { persist: vi.fn() } });
    expect(isSupported()).toBe(false);
  });
});

describe("checkAlreadyPersisted", () => {
  it("returns false when navigator.storage is absent", async () => {
    vi.stubGlobal("navigator", { storage: undefined });
    expect(await checkAlreadyPersisted()).toBe(false);
  });

  it("delegates to navigator.storage.persisted()", async () => {
    const persisted = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persisted } });
    expect(await checkAlreadyPersisted()).toBe(true);
    expect(persisted).toHaveBeenCalledTimes(1);
  });
});

describe("requestPersist", () => {
  it("returns false when navigator.storage is absent", async () => {
    vi.stubGlobal("navigator", { storage: undefined });
    expect(await requestPersist()).toBe(false);
  });

  it("delegates to navigator.storage.persist()", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist } });
    expect(await requestPersist()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
