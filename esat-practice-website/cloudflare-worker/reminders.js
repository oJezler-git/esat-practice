// Pure reminder-scheduling helpers, isolated from KV/crypto so they can be unit
// tested directly. A stored reminder record looks like:
//   { subscription, time: "HH:MM", timeZone, tzOffsetMinutes, lastSent: "YYYY-MM-DD" | null }
// timeZone is the IANA zone (e.g. "Europe/London") captured at subscribe time and
// is authoritative; tzOffsetMinutes (the browser's Date.getTimezoneOffset() value)
// is a fallback for records saved before timeZone existed. Using the IANA zone lets
// the offset be recomputed per run so reminders stay correct across DST changes.

import { base64UrlToBytes } from "./web-push.js";

export const PUSH_KEY_PREFIX = "push:";

// Local minute-of-day and calendar date at `nowMs`. Prefers the IANA zone;
// falls back to the fixed offset (local = UTC - offsetMinutes).
export function localParts(nowMs, tzOffsetMinutes, timeZone) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(new Date(nowMs));
      const get = (type) => parts.find((p) => p.type === type)?.value;
      const minutes = Number(get("hour")) * 60 + Number(get("minute"));
      const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
      return { minutes, dateStr };
    } catch {
      // Unknown zone — fall through to the offset path.
    }
  }
  const shifted = new Date(nowMs - (tzOffsetMinutes ?? 0) * 60_000);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const dateStr = shifted.toISOString().slice(0, 10);
  return { minutes, dateStr };
}

export function parseReminderMinutes(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

// If a reminder is due right now, returns { dateStr } identifying the local day
// the firing belongs to; otherwise null. The occurrence is attributed to the
// reminder's own local day (not the tick's), so a reminder scheduled just before
// midnight still fires — and dedupes — correctly when the covering cron tick
// lands after midnight. `minutesSince` wraps mod a day for that boundary case.
export function reminderOccurrence(record, nowMs, windowMinutes) {
  const reminderMinute = parseReminderMinutes(record?.time);
  if (reminderMinute === null) return null;

  const { minutes } = localParts(nowMs, record.tzOffsetMinutes, record.timeZone);
  const minutesSince = (minutes - reminderMinute + 1440) % 1440;
  if (minutesSince >= windowMinutes) return null;

  // The date of the reminder instant itself (back up to when it was scheduled).
  const { dateStr } = localParts(
    nowMs - minutesSince * 60_000,
    record.tzOffsetMinutes,
    record.timeZone,
  );
  if (record.lastSent === dateStr) return null;
  return { dateStr };
}

// Convenience boolean wrapper.
export function isReminderDue(record, nowMs, windowMinutes) {
  return reminderOccurrence(record, nowMs, windowMinutes) !== null;
}

// Decoded byte lengths WebCrypto requires: p256dh is an uncompressed P-256
// point (0x04 || X(32) || Y(32)), auth is a 16-byte secret. A record that
// fails this never encrypts successfully, so validating it now means it's
// rejected at subscribe time instead of erroring on every cron sweep forever.
function isValidP256dh(b64url) {
  try {
    const bytes = base64UrlToBytes(b64url);
    return bytes.length === 65 && bytes[0] === 0x04;
  } catch {
    return false;
  }
}

function isValidAuthSecret(b64url) {
  try {
    return base64UrlToBytes(b64url).length === 16;
  } catch {
    return false;
  }
}

function isValidEndpoint(endpoint) {
  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

// Shared shape/byte-length check used both when storing a reminder and when
// sending an immediate test push, so a malformed subscription is rejected in
// both paths rather than only being caught (repeatedly) by the cron sweep.
export function isValidSubscription(subscription) {
  return (
    !!subscription &&
    typeof subscription.endpoint === "string" &&
    !!subscription.keys &&
    typeof subscription.keys.p256dh === "string" &&
    typeof subscription.keys.auth === "string" &&
    isValidEndpoint(subscription.endpoint) &&
    isValidP256dh(subscription.keys.p256dh) &&
    isValidAuthSecret(subscription.keys.auth)
  );
}

// Validate + normalise a subscribe request body. Returns { record } or { error }.
export function normalizeSubscription(body) {
  const subscription = body?.subscription;
  if (!isValidSubscription(subscription)) {
    return { error: "Invalid or missing push subscription." };
  }
  if (parseReminderMinutes(body.time) === null) {
    return { error: "Invalid reminder time. Use HH:MM (24-hour)." };
  }
  const tzOffsetMinutes = Number(body.tzOffsetMinutes);
  if (!Number.isFinite(tzOffsetMinutes) || Math.abs(tzOffsetMinutes) > 24 * 60) {
    return { error: "Invalid timezone offset." };
  }
  const timeZone =
    typeof body.timeZone === "string" && body.timeZone.length <= 64
      ? body.timeZone
      : null;
  return {
    record: {
      subscription: {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      time: body.time,
      timeZone,
      tzOffsetMinutes,
      lastSent: null,
    },
  };
}

// KV key derived from the subscription endpoint so the same device updates in
// place rather than accumulating duplicate records.
export async function pushKeyForEndpoint(endpoint) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return PUSH_KEY_PREFIX + hex;
}
