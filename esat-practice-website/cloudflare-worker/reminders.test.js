import { describe, it, expect } from "vitest";
import { bytesToBase64Url } from "./web-push.js";
import {
  PUSH_KEY_PREFIX,
  isReminderDue,
  isValidSubscription,
  localParts,
  normalizeSubscription,
  parseReminderMinutes,
  pushKeyForEndpoint,
  reminderOccurrence,
} from "./reminders.js";

const UTC_NOON = Date.parse("2024-01-01T12:00:00Z");

async function realKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { p256dh: bytesToBase64Url(rawPublic), auth: bytesToBase64Url(auth) };
}

async function validSub() {
  return {
    endpoint: "https://push.example.com/abc",
    keys: await realKeys(),
  };
}

describe("parseReminderMinutes", () => {
  it("parses valid HH:MM", () => {
    expect(parseReminderMinutes("00:00")).toBe(0);
    expect(parseReminderMinutes("18:00")).toBe(1080);
    expect(parseReminderMinutes("23:59")).toBe(1439);
  });

  it("rejects malformed or out-of-range values", () => {
    expect(parseReminderMinutes("24:00")).toBeNull();
    expect(parseReminderMinutes("18:60")).toBeNull();
    expect(parseReminderMinutes("7:05")).toBeNull();
    expect(parseReminderMinutes("nope")).toBeNull();
    expect(parseReminderMinutes(undefined)).toBeNull();
  });
});

describe("localParts", () => {
  it("shifts UTC into local time using the browser offset convention", () => {
    // UTC+1 reports getTimezoneOffset() === -60.
    expect(localParts(UTC_NOON, -60)).toEqual({ minutes: 13 * 60, dateStr: "2024-01-01" });
    // UTC-5 reports +300.
    expect(localParts(UTC_NOON, 300)).toEqual({ minutes: 7 * 60, dateStr: "2024-01-01" });
  });

  it("rolls the local date over when the offset crosses midnight", () => {
    // 23:30 UTC in UTC+1 -> 00:30 next day.
    const late = Date.parse("2024-01-01T23:30:00Z");
    expect(localParts(late, -60)).toEqual({ minutes: 30, dateStr: "2024-01-02" });
  });
});

describe("isReminderDue", () => {
  const base = { time: "13:00", tzOffsetMinutes: -60, lastSent: null };

  it("is due at the reminder minute within the window", () => {
    expect(isReminderDue(base, UTC_NOON, 15)).toBe(true); // local 13:00
  });

  it("is due later in the window", () => {
    const t = Date.parse("2024-01-01T12:10:00Z"); // local 13:10
    expect(isReminderDue(base, t, 15)).toBe(true);
  });

  it("is not due before the window", () => {
    const t = Date.parse("2024-01-01T11:40:00Z"); // local 12:40
    expect(isReminderDue(base, t, 15)).toBe(false);
  });

  it("is not due once past the window", () => {
    const t = Date.parse("2024-01-01T12:20:00Z"); // local 13:20
    expect(isReminderDue(base, t, 15)).toBe(false);
  });

  it("is not due if already sent on the local day", () => {
    expect(isReminderDue({ ...base, lastSent: "2024-01-01" }, UTC_NOON, 15)).toBe(false);
  });

  it("is not due for an unparseable time", () => {
    expect(isReminderDue({ ...base, time: "oops" }, UTC_NOON, 15)).toBe(false);
  });
});

describe("reminderOccurrence — midnight boundary", () => {
  // A 23:50 reminder is only covered by the 00:00 cron tick, which is the next
  // local day. The occurrence must still fire and be attributed to the day the
  // reminder belongs to.
  const record = { time: "23:50", tzOffsetMinutes: 0, lastSent: null };
  const nextMidnightUtc = Date.parse("2024-01-02T00:00:00Z");

  it("fires the late-night reminder at the post-midnight tick", () => {
    const occ = reminderOccurrence(record, nextMidnightUtc, 20);
    expect(occ).toEqual({ dateStr: "2024-01-01" });
  });

  it("dedupes on the reminder's own day, not the tick's day", () => {
    expect(
      reminderOccurrence({ ...record, lastSent: "2024-01-01" }, nextMidnightUtc, 20),
    ).toBeNull();
  });
});

describe("localParts / reminderOccurrence — IANA zone beats stale offset (DST)", () => {
  it("uses the IANA zone when present", () => {
    // London is UTC+1 in July; a stored winter offset of 0 would be wrong.
    const summer = Date.parse("2024-07-01T17:00:00Z"); // 18:00 in London
    expect(localParts(summer, 0, "Europe/London").minutes).toBe(18 * 60);
    const record = { time: "18:00", timeZone: "Europe/London", tzOffsetMinutes: 0, lastSent: null };
    expect(isReminderDue(record, summer, 20)).toBe(true);
  });

  it("falls back to the fixed offset for an unknown zone", () => {
    expect(localParts(UTC_NOON, -60, "Not/AZone")).toEqual({ minutes: 13 * 60, dateStr: "2024-01-01" });
  });
});

describe("normalizeSubscription", () => {
  it("accepts a valid body and defaults lastSent to null", async () => {
    const sub = await validSub();
    const { record, error } = normalizeSubscription({
      subscription: sub,
      time: "18:00",
      tzOffsetMinutes: 0,
    });
    expect(error).toBeUndefined();
    expect(record.time).toBe("18:00");
    expect(record.tzOffsetMinutes).toBe(0);
    expect(record.lastSent).toBeNull();
    expect(record.subscription.endpoint).toBe(sub.endpoint);
  });

  it("rejects a missing or malformed subscription", () => {
    expect(normalizeSubscription({ time: "18:00", tzOffsetMinutes: 0 }).error).toMatch(/subscription/i);
    expect(
      normalizeSubscription({ subscription: { endpoint: "x" }, time: "18:00", tzOffsetMinutes: 0 }).error,
    ).toMatch(/subscription/i);
  });

  it("rejects a bad time", async () => {
    const sub = await validSub();
    expect(normalizeSubscription({ subscription: sub, time: "9pm", tzOffsetMinutes: 0 }).error).toMatch(/time/i);
  });

  it("rejects an out-of-range timezone offset", async () => {
    const sub = await validSub();
    expect(normalizeSubscription({ subscription: sub, time: "18:00", tzOffsetMinutes: 9999 }).error).toMatch(/timezone/i);
    expect(normalizeSubscription({ subscription: sub, time: "18:00", tzOffsetMinutes: "x" }).error).toMatch(/timezone/i);
  });

  it("rejects keys with the wrong decoded byte length", async () => {
    const sub = await validSub();
    expect(
      normalizeSubscription({
        subscription: { ...sub, keys: { ...sub.keys, p256dh: "BPk" } },
        time: "18:00",
        tzOffsetMinutes: 0,
      }).error,
    ).toMatch(/subscription/i);
    expect(
      normalizeSubscription({
        subscription: { ...sub, keys: { ...sub.keys, auth: "c2VjcmV0" } },
        time: "18:00",
        tzOffsetMinutes: 0,
      }).error,
    ).toMatch(/subscription/i);
  });

  it("rejects a non-https endpoint", async () => {
    const sub = await validSub();
    expect(
      normalizeSubscription({
        subscription: { ...sub, endpoint: "http://push.example.com/abc" },
        time: "18:00",
        tzOffsetMinutes: 0,
      }).error,
    ).toMatch(/subscription/i);
  });
});

describe("isValidSubscription", () => {
  it("accepts a well-formed subscription", async () => {
    expect(isValidSubscription(await validSub())).toBe(true);
  });

  it("rejects undefined", () => {
    expect(isValidSubscription(undefined)).toBe(false);
  });
});

describe("pushKeyForEndpoint", () => {
  it("derives a stable prefixed key from the endpoint", async () => {
    const a = await pushKeyForEndpoint("https://push.example.com/abc");
    const b = await pushKeyForEndpoint("https://push.example.com/abc");
    const c = await pushKeyForEndpoint("https://push.example.com/xyz");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith(PUSH_KEY_PREFIX)).toBe(true);
    expect(a.slice(PUSH_KEY_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);
  });
});
