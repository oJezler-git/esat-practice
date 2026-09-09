import revisionContext from "./revision-context.json";
import { sendPushNotification } from "./web-push.js";
import {
  PUSH_KEY_PREFIX,
  isValidSubscription,
  localParts,
  normalizeSubscription,
  pushKeyForEndpoint,
  reminderOccurrence,
} from "./reminders.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_QUESTION_LENGTH = 400;
const MAX_HISTORY_TURNS = 4;

// KV values cap at 25MB, but a legitimate sync payload (sessions/attempts/
// excludedQuestions for one user) is nowhere near that. Cap well below the KV
// limit so a bad-faith PUT to a guessed key can't be used to squat on storage.
const MAX_SYNC_PAYLOAD_BYTES = 2_000_000;
const SYNC_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const CHANGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SYNC_MUTATIONS = 500;
const MAX_SYNC_CHANGES = 500;
const SYNC_ENTITIES = new Set(["session", "attempt", "excludedQuestion"]);

// Wider than the 15-minute cron interval (wrangler.toml) so a delayed or skipped
// tick still catches the reminder on the next run. Per-day dedupe (lastSent)
// prevents the overlap from sending twice.
const REMINDER_WINDOW_MINUTES = 20;

// Statuses the push service returns for a request that will never succeed no
// matter how many times it's retried (bad/expired subscription, malformed
// request, oversized payload). Anything else (429, 5xx, network errors) is
// treated as transient and left to retry on the next cron tick.
const PERMANENT_FAILURE_STATUSES = new Set([400, 401, 403, 404, 410, 413]);

// Vibration pattern echoing the 4 syllables of "e-SAT prac-tice": short,
// long/stressed, medium, short, each separated by a pause (ms).
const PRACTICE_VIBRATE_PATTERN = [100, 80, 220, 80, 140, 80, 100];

const REMINDER_ACTIONS = [
  { action: "start", title: "Start practice" },
  { action: "dismiss", title: "Later" },
];

// Rotated so the daily reminder doesn't read identically forever. The server
// has no access to a user's practice stats (those live only in client-side
// IndexedDB and are never synced), so these are generic-but-varied rather
// than personalized. Selection is a deterministic hash of (subscription key,
// local date) — same user won't see the same line two days running, and two
// users can land on different lines on the same day.
const REMINDER_MESSAGES = [
  { title: "Time to practise", body: "A few ESAT questions now keeps you sharp. Jump back in →" },
  { title: "Ready for a quick round?", body: "Even 10 minutes of practice adds up. Let's go →" },
  { title: "Your questions are waiting", body: "Pick up where you left off and keep the momentum going." },
  { title: "Sharpen up", body: "A short session now beats a long cram later." },
  { title: "Quick brain check", body: "See how many you can get right in the next few minutes." },
  { title: "Practice o'clock", body: "Consistency beats intensity — a few questions a day goes a long way." },
  { title: "Still got it?", body: "Test yourself with a fresh set of ESAT questions." },
  { title: "Small steps, steady gains", body: "Jump into a quick practice session and keep building." },
  { title: "Don't break the streak", body: "One quick session keeps today on the board." },
  { title: "Brain warm-up time", body: "Get a few questions in before the day gets away from you." },
  { title: "Five minutes to spare?", body: "That's enough for a solid round of questions." },
  { title: "Level up", body: "Every session moves the needle, even a short one." },
  { title: "Your future self says thanks", body: "Practice now, thank yourself on exam day." },
  { title: "Reps make it stick", body: "Come get a few more reps in on ESAT questions." },
  { title: "Session check-in", body: "Haven't practised today — want to fix that now?" },
  { title: "Keep the streak alive", body: "A quick round is all it takes to keep going." },
  { title: "Question time", body: "Fresh questions, ready when you are." },
  { title: "Progress loves consistency", body: "Small, regular sessions beat rare marathon ones." },
  { title: "Exam-day confidence starts here", body: "Build it one practice session at a time." },
  { title: "A little goes a long way", body: "Even a short round keeps your skills warm." },
  { title: "Back at it?", body: "Your next set of ESAT questions is ready to go." },
  { title: "Stay sharp", body: "Don't let the day slip by without a quick round." },
  { title: "Momentum check", body: "Keep it going with a few more questions today." },
  { title: "Quick win available", body: "A short session now is an easy win for today." },
  { title: "Practice makes progress", body: "Jump in for a few questions and keep the habit going." },
  { title: "Today's the day", body: "Squeeze in a round before you close the laptop." },
  { title: "Keep your edge", body: "Regular practice is what separates good from great." },
  { title: "A few more questions?", body: "Your practice set is ready whenever you are." },
  { title: "Don't skip today", body: "Consistency beats cramming — jump back in." },
  { title: "Test yourself", body: "See where you stand with a quick round of questions." },
  { title: "Little and often", body: "A short session today keeps the knowledge fresh." },
  { title: "Ready when you are", body: "Your next batch of ESAT questions is waiting." },
];

// Cheap synchronous string hash (FNV-1a) — no crypto strength needed, this
// only picks an index into REMINDER_MESSAGES.
function hashString(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function buildReminderPayload(seed) {
  const message = REMINDER_MESSAGES[hashString(seed) % REMINDER_MESSAGES.length];
  return JSON.stringify({
    ...message,
    url: "/practice",
    tag: "esat-reminder",
    requireInteraction: true,
    vibrate: PRACTICE_VIBRATE_PATTERN,
    actions: REMINDER_ACTIONS,
  });
}

const TEST_PAYLOAD = JSON.stringify({
  title: "Test notification",
  body: "If you can see this, your reminders are set up correctly.",
  url: "/settings",
  tag: "esat-test",
  requireInteraction: true,
  vibrate: PRACTICE_VIBRATE_PATTERN,
  actions: REMINDER_ACTIONS,
});

function buildSystemInstruction(title, content) {
  return [
    "You are a revision assistant embedded in an ESAT (Engineering and Science Admissions Test) practice site.",
    `You are answering questions about exactly one revision guide, titled "${title}".`,
    "Answer only using the guide content below. Keep answers short and exam-focused.",
    "If the question is outside what this guide covers, say so plainly and suggest the student check the relevant topic guide instead of guessing.",
    "Do not invent formulas, constants, or facts that are not in the guide.",
    "",
    "--- GUIDE CONTENT ---",
    content,
  ].join("\n");
}

async function handleRevisionAsk(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400, headers: CORS });
  }

  const moduleSlug = String(body.moduleSlug ?? "").trim();
  const topicSlug = String(body.topicSlug ?? "").trim();
  const question = String(body.question ?? "").trim();

  if (!question) {
    return new Response("Question is required.", { status: 400, headers: CORS });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return new Response(`Question must be ${MAX_QUESTION_LENGTH} characters or fewer.`, { status: 400, headers: CORS });
  }

  const doc = revisionContext[`${moduleSlug}/${topicSlug}`];
  if (!doc) {
    return new Response("Unknown revision topic.", { status: 404, headers: CORS });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response("AI assistant is not configured.", { status: 503, headers: CORS });
  }

  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];
  const contents = [
    ...history.flatMap((turn) =>
      turn && (turn.role === "user" || turn.role === "model") && typeof turn.text === "string"
        ? [{ role: turn.role, parts: [{ text: turn.text.slice(0, MAX_QUESTION_LENGTH) }] }]
        : [],
    ),
    { role: "user", parts: [{ text: question }] },
  ];

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

  let geminiResponse;
  try {
    geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemInstruction(doc.title, doc.content) }] },
        contents,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.3,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch (err) {
    return new Response(`Could not reach the AI provider: ${err instanceof Error ? err.message : String(err)}`, {
      status: 502,
      headers: CORS,
    });
  }

  if (!geminiResponse.ok) {
    const status = geminiResponse.status === 429 ? 429 : 502;
    const rawBody = await geminiResponse.text().catch(() => "");
    let detail = rawBody;
    try {
      detail = JSON.parse(rawBody)?.error?.message ?? rawBody;
    } catch {
      // rawBody wasn't JSON — use it as-is.
    }
    const prefix =
      status === 429
        ? "Gemini's free-tier rate limit was hit"
        : `Gemini API request failed (HTTP ${geminiResponse.status})`;
    return new Response(detail ? `${prefix}: ${detail}` : `${prefix}.`, { status, headers: CORS });
  }

  const data = await geminiResponse.json();
  const candidate = data.candidates?.[0];
  const answer = candidate?.content?.parts?.[0]?.text?.trim();

  if (!answer) {
    const reason = candidate?.finishReason ?? "unknown reason";
    return new Response(`The AI assistant did not return an answer (finish reason: ${reason}).`, {
      status: 502,
      headers: CORS,
    });
  }

  return new Response(JSON.stringify({ answer }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Word pairs reserved to prevent abuse (treated as fully exhausted for 4-digit keys).
const RESERVED_PAIRS = new Set(["amber-forest"]);

async function handleCreate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400, headers: CORS });
  }

  const words = (body.words ?? "").trim().toLowerCase();

  if (!/^[a-z]+-[a-z]+$/.test(words)) {
    return new Response("Invalid format. Provide exactly two words separated by a hyphen, e.g. amber-forest.", { status: 400, headers: CORS });
  }

  const [word1, word2] = words.split("-");

  for (const w of [word1, word2]) {
    if (!/^[a-z]+$/.test(w)) {
      return new Response("Words must contain only letters (a–z), no spaces or numbers.", { status: 400, headers: CORS });
    }
    if (w.length < 2 || w.length > 20) {
      return new Response("Each word must be between 2 and 20 letters.", { status: 400, headers: CORS });
    }
  }

  // Try 4-digit numbers unless the pair is reserved.
  let key = null;

  // Each candidate maps to one Durable Object, so concurrent claims for the same
  // key are serialized. The KV fallback exists only for local/legacy test setups.
  async function tryClaimSlot(candidate) {
    if (env.SYNC_DOCUMENTS) {
      const response = await syncStub(env, candidate).fetch("https://sync.internal/claim", {
        method: "POST",
        headers: { "X-Sync-Key": candidate },
      });
      return response.status === 201;
    }
    const existing = await env.KV.get(candidate);
    if (existing !== null) return false;
    await env.KV.put(candidate, "__reserved__", { expirationTtl: 3600 });
    return true;
  }

  if (!RESERVED_PAIRS.has(words)) {
    for (let i = 0; i < 50; i++) {
      const num = String(Math.floor(1000 + Math.random() * 9000));
      const candidate = `${words}-${num}`;
      if (await tryClaimSlot(candidate)) {
        key = candidate;
        break;
      }
    }
  }

  // Fall back to 5-digit if the 4-digit space appears saturated (or pair is reserved).
  if (!key) {
    for (let i = 0; i < 50; i++) {
      const num = String(Math.floor(10000 + Math.random() * 90000));
      const candidate = `${words}-${num}`;
      if (await tryClaimSlot(candidate)) {
        key = candidate;
        break;
      }
    }
  }

  if (!key) {
    return new Response("Could not allocate a sync key. Try again.", { status: 503, headers: CORS });
  }

  return new Response(JSON.stringify({ key }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// POST /push/subscribe — store or update a device's daily reminder.
async function handlePushSubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400, headers: CORS });
  }

  const { record, error } = normalizeSubscription(body);
  if (error) {
    return new Response(error, { status: 400, headers: CORS });
  }

  const key = await pushKeyForEndpoint(record.subscription.endpoint);
  // Preserve lastSent/practicedDate if this device already has a record, so
  // changing the reminder time mid-day doesn't cause a duplicate notification
  // or forget that today's session is already done.
  const existingRaw = await env.KV.get(key);
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      record.lastSent = existing.lastSent ?? null;
      record.practicedDate = existing.practicedDate ?? null;
    } catch {
      // Corrupt record — overwrite it fresh.
    }
  }
  await env.KV.put(key, JSON.stringify(record), { expirationTtl: 31_536_000 });
  return new Response("ok", { status: 200, headers: CORS });
}

// POST /push/mark-practiced — best-effort ping from the client on session
// completion so the reminder sweep can skip nudging someone who already
// practiced today. Silently no-ops if the device has no reminder subscribed
// (nothing to update) rather than erroring — the caller doesn't need to know
// or care whether reminders are enabled.
async function handleMarkPracticed(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400, headers: CORS });
  }
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string") {
    return new Response("Missing endpoint.", { status: 400, headers: CORS });
  }

  const key = await pushKeyForEndpoint(endpoint);
  const raw = await env.KV.get(key);
  if (!raw) return new Response("ok", { status: 200, headers: CORS });

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200, headers: CORS });
  }

  const { dateStr } = localParts(Date.now(), record.tzOffsetMinutes, record.timeZone);
  record.practicedDate = dateStr;
  await env.KV.put(key, JSON.stringify(record), { expirationTtl: 31_536_000 });
  return new Response("ok", { status: 200, headers: CORS });
}

// POST /push/unsubscribe — remove a device's reminder.
async function handlePushUnsubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400, headers: CORS });
  }
  const endpoint = body?.endpoint ?? body?.subscription?.endpoint;
  if (typeof endpoint !== "string") {
    return new Response("Missing endpoint.", { status: 400, headers: CORS });
  }
  await env.KV.delete(await pushKeyForEndpoint(endpoint));
  return new Response("ok", { status: 200, headers: CORS });
}

// POST /push/test — send an immediate one-off push to the caller's own
// subscription, bypassing the daily lastSent dedupe. Lets a user verify their
// setup works without waiting for the next cron window.
async function handlePushTest(request, env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return new Response("Push notifications are not configured on the server.", {
      status: 503,
      headers: CORS,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400, headers: CORS });
  }

  const subscription = body?.subscription;
  if (!isValidSubscription(subscription)) {
    return new Response("Invalid or missing push subscription.", { status: 400, headers: CORS });
  }

  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  };

  try {
    const response = await sendPushNotification(subscription, TEST_PAYLOAD, vapid);
    if (!response.ok) {
      return new Response(`Push service rejected the notification (HTTP ${response.status}).`, {
        status: 502,
        headers: CORS,
      });
    }
    return new Response("ok", { status: 200, headers: CORS });
  } catch (err) {
    console.error("Failed to send test push", err);
    return new Response("Failed to send test notification.", { status: 502, headers: CORS });
  }
}

// Cron entry point: send reminders that are due this window and prune dead subs.
async function runReminderSweep(env, nowMs = Date.now()) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    console.error("VAPID keys not configured; skipping reminder sweep.");
    return;
  }
  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  };

  let cursor;
  do {
    const list = await env.KV.list({ prefix: PUSH_KEY_PREFIX, cursor });
    cursor = list.list_complete ? undefined : list.cursor;

    for (const { name } of list.keys) {
      const raw = await env.KV.get(name);
      if (!raw) continue;
      let record;
      try {
        record = JSON.parse(raw);
      } catch {
        await env.KV.delete(name);
        continue;
      }
      const occurrence = reminderOccurrence(record, nowMs, REMINDER_WINDOW_MINUTES);
      if (!occurrence) continue;

      try {
        const response = await sendPushNotification(
          record.subscription,
          buildReminderPayload(name + occurrence.dateStr),
          vapid,
        );
        if (PERMANENT_FAILURE_STATUSES.has(response.status)) {
          await env.KV.delete(name);
          continue;
        }
        if (response.ok) {
          record.lastSent = occurrence.dateStr;
          await env.KV.put(name, JSON.stringify(record), {
            expirationTtl: 31_536_000,
          });
        }
      } catch (err) {
        console.error("Failed to send reminder", err);
      }
    }
  } while (cursor);
}

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function sqlRows(cursor) {
  if (!cursor) return [];
  if (typeof cursor.toArray === "function") return cursor.toArray();
  return Array.from(cursor);
}

function validId(value, max = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function entityIdForLegacy(entity, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (entity === "excludedQuestion") return validId(value.question_id) ? value.question_id : null;
  return validId(value.id) ? value.id : null;
}

function validateV1Payload(value) {
  return Boolean(
    value &&
    value.version === 1 &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.attempts) &&
    Array.isArray(value.excludedQuestions),
  );
}

function validateExchange(value) {
  if (!value || value.version !== 2 || !validId(value.deviceId, 128)) {
    return "Invalid v2 sync request.";
  }
  if (value.epoch !== null && (!Number.isSafeInteger(value.epoch) || value.epoch < 1)) {
    return "Invalid epoch.";
  }
  if (value.cursor !== null && (!Number.isSafeInteger(value.cursor) || value.cursor < 0)) {
    return "Invalid cursor.";
  }
  if (!Array.isArray(value.mutations) || value.mutations.length > MAX_SYNC_MUTATIONS) {
    return `mutations must contain at most ${MAX_SYNC_MUTATIONS} items.`;
  }
  const mutationIds = new Set();
  for (const mutation of value.mutations) {
    if (!mutation || !validId(mutation.mutationId, 128) || mutationIds.has(mutation.mutationId)) {
      return "Each mutation must have a unique, valid mutationId.";
    }
    mutationIds.add(mutation.mutationId);
    if (!SYNC_ENTITIES.has(mutation.entity) || !validId(mutation.entityId)) {
      return "Invalid mutation entity or entityId.";
    }
    if (mutation.action !== "upsert" && mutation.action !== "delete") {
      return "Invalid mutation action.";
    }
    if (mutation.action === "upsert" && (!mutation.value || typeof mutation.value !== "object" || Array.isArray(mutation.value))) {
      return "Upsert mutations require an object value.";
    }
    if (mutation.action === "upsert" && entityIdForLegacy(mutation.entity, mutation.value) !== mutation.entityId) {
      return "Mutation entityId must match the value's stable ID.";
    }
  }
  return null;
}

function syncStub(env, key) {
  const id = env.SYNC_DOCUMENTS.idFromName(key.trim().toLowerCase());
  return env.SYNC_DOCUMENTS.get(id);
}

async function proxySyncDocument(request, env, key, action) {
  const internal = new URL(request.url);
  internal.pathname = `/${action}`;
  const headers = new Headers(request.headers);
  headers.set("X-Sync-Key", key);
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.arrayBuffer();
  const response = await syncStub(env, key).fetch(new Request(internal, {
    method: request.method,
    headers,
    body,
    redirect: request.redirect,
  }));
  const responseHeaders = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS)) responseHeaders.set(name, value);
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

/**
 * Strongly consistent per-key sync document. Entity values stay opaque to the
 * server; only their stable IDs and ordered mutations participate in merging.
 */
export class SyncDocument {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS metadata (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        schema_version INTEGER NOT NULL,
        epoch INTEGER NOT NULL,
        head_revision INTEGER NOT NULL,
        min_revision INTEGER NOT NULL,
        last_activity INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        migrated INTEGER NOT NULL,
        claimed INTEGER NOT NULL
      )`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS entities (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        value TEXT,
        deleted INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      )`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS changes (
        revision INTEGER PRIMARY KEY,
        mutation_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        value TEXT,
        device_id TEXT NOT NULL,
        server_timestamp INTEGER NOT NULL
      )`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS processed_mutations (
        mutation_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        processed_at INTEGER NOT NULL
      )`);
      this.sql.exec("CREATE INDEX IF NOT EXISTS changes_timestamp ON changes(server_timestamp)");
      this.sql.exec("CREATE INDEX IF NOT EXISTS mutations_timestamp ON processed_mutations(processed_at)");
    });
  }

  metadata() {
    return sqlRows(this.sql.exec("SELECT * FROM metadata WHERE singleton = 1"))[0] ?? null;
  }

  async ensureImported() {
    if (this.metadata()?.migrated) return;
    const legacy = await this.env.KV?.get(this.key);
    const now = Date.now();
    let payload = null;
    if (legacy && legacy !== "__reserved__") {
      try {
        const parsed = JSON.parse(legacy);
        if (validateV1Payload(parsed)) payload = parsed;
      } catch {
        // A corrupt legacy value is considered consumed, but never imported.
      }
    }
    this.ctx.storage.transactionSync(() => {
      if (this.metadata()?.migrated) return;
      this.sql.exec(
        "INSERT OR REPLACE INTO metadata VALUES (1, 2, 1, 0, 1, ?, ?, 1, ?)",
        now,
        now + SYNC_TTL_MS,
        legacy !== null ? 1 : 0,
      );
      if (payload) this.importLegacy(payload, "legacy-migration", now);
    });
    await this.touchAlarm(now);
  }

  importLegacy(payload, deviceId, now) {
    const groups = [
      ["session", payload.sessions],
      ["attempt", payload.attempts],
      ["excludedQuestion", payload.excludedQuestions],
    ];
    for (const [entity, values] of groups) {
      for (const value of values) {
        const entityId = entityIdForLegacy(entity, value);
        if (!entityId) continue;
        this.applyMutation({
          mutationId: `legacy:${entity}:${entityId}:${crypto.randomUUID()}`,
          entity,
          entityId,
          action: "upsert",
          value,
        }, deviceId, now);
      }
    }
  }

  applyMutation(mutation, deviceId, now) {
    const seen = sqlRows(this.sql.exec(
      "SELECT revision FROM processed_mutations WHERE mutation_id = ?",
      mutation.mutationId,
    ))[0];
    if (seen) return seen.revision;
    const meta = this.metadata();
    const revision = meta.head_revision + 1;
    const value = mutation.action === "upsert" ? JSON.stringify(mutation.value) : null;
    this.sql.exec(
      `INSERT OR REPLACE INTO entities
       (entity_type, entity_id, value, deleted, revision) VALUES (?, ?, ?, ?, ?)`,
      mutation.entity,
      mutation.entityId,
      value,
      mutation.action === "delete" ? 1 : 0,
      revision,
    );
    this.sql.exec(
      `INSERT INTO changes
       (revision, mutation_id, entity_type, entity_id, action, value, device_id, server_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      revision,
      mutation.mutationId,
      mutation.entity,
      mutation.entityId,
      mutation.action,
      value,
      deviceId,
      now,
    );
    this.sql.exec(
      "INSERT INTO processed_mutations (mutation_id, revision, processed_at) VALUES (?, ?, ?)",
      mutation.mutationId,
      revision,
      now,
    );
    this.sql.exec("UPDATE metadata SET head_revision = ?, claimed = 1 WHERE singleton = 1", revision);
    return revision;
  }

  compact(now) {
    const cutoff = now - CHANGE_RETENTION_MS;
    const removed = sqlRows(this.sql.exec(
      "SELECT MAX(revision) AS revision FROM changes WHERE server_timestamp < ?",
      cutoff,
    ))[0]?.revision;
    if (removed != null) {
      this.sql.exec("DELETE FROM changes WHERE server_timestamp < ?", cutoff);
      this.sql.exec("UPDATE metadata SET min_revision = MAX(min_revision, ?) WHERE singleton = 1", removed + 1);
    }
    this.sql.exec("DELETE FROM processed_mutations WHERE processed_at < ?", now - SYNC_TTL_MS);
  }

  snapshot() {
    const result = { sessions: [], attempts: [], excludedQuestions: [] };
    const targets = {
      session: result.sessions,
      attempt: result.attempts,
      excludedQuestion: result.excludedQuestions,
    };
    for (const row of sqlRows(this.sql.exec("SELECT entity_type, value FROM entities WHERE deleted = 0 ORDER BY revision"))) {
      const target = targets[row.entity_type];
      if (target && row.value) target.push(JSON.parse(row.value));
    }
    return result;
  }

  async touchAlarm(now) {
    await this.ctx.storage.setAlarm(now + SYNC_TTL_MS);
  }

  async claim() {
    await this.ensureImported();
    const meta = this.metadata();
    if (meta.claimed) return new Response("Already claimed", { status: 409 });
    const now = Date.now();
    this.sql.exec(
      "UPDATE metadata SET claimed = 1, last_activity = ?, expires_at = ? WHERE singleton = 1",
      now,
      now + SYNC_TTL_MS,
    );
    await this.touchAlarm(now);
    return new Response("Claimed", { status: 201 });
  }

  async exchange(request) {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_SYNC_PAYLOAD_BYTES) {
      return new Response("Payload too large.", { status: 413 });
    }
    let body;
    try { body = JSON.parse(raw); } catch { return new Response("Invalid JSON body.", { status: 400 }); }
    const error = validateExchange(body);
    if (error) return new Response(error, { status: 400 });
    await this.ensureImported();
    const before = this.metadata();
    if (body.epoch !== null && body.epoch !== before.epoch) {
      const now = Date.now();
      this.sql.exec(
        "UPDATE metadata SET claimed = 1, last_activity = ?, expires_at = ? WHERE singleton = 1",
        now,
        now + SYNC_TTL_MS,
      );
      await this.touchAlarm(now);
      return jsonResponse({
        version: 2,
        epoch: before.epoch,
        cursor: before.head_revision,
        hasMore: false,
        reset: true,
        acceptedMutationIds: [],
        snapshot: this.snapshot(),
      });
    }
    const now = Date.now();
    const acceptedMutationIds = [];
    this.ctx.storage.transactionSync(() => {
      for (const mutation of body.mutations) {
        this.applyMutation(mutation, body.deviceId, now);
        acceptedMutationIds.push(mutation.mutationId);
      }
      this.compact(now);
      this.sql.exec(
        "UPDATE metadata SET claimed = 1, last_activity = ?, expires_at = ? WHERE singleton = 1",
        now,
        now + SYNC_TTL_MS,
      );
    });
    await this.touchAlarm(now);
    const meta = this.metadata();
    const mustReset = body.epoch === null || body.epoch !== meta.epoch || body.cursor === null ||
      body.cursor < meta.min_revision - 1 || body.cursor > meta.head_revision;
    if (mustReset) {
      return jsonResponse({
        version: 2,
        epoch: meta.epoch,
        cursor: meta.head_revision,
        hasMore: false,
        reset: true,
        acceptedMutationIds,
        snapshot: this.snapshot(),
      });
    }
    const rows = sqlRows(this.sql.exec(
      "SELECT * FROM changes WHERE revision > ? ORDER BY revision LIMIT ?",
      body.cursor,
      MAX_SYNC_CHANGES + 1,
    ));
    const hasMore = rows.length > MAX_SYNC_CHANGES;
    const page = rows.slice(0, MAX_SYNC_CHANGES);
    const changes = page.map((row) => ({
      mutationId: row.mutation_id,
      entity: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      ...(row.value ? { value: JSON.parse(row.value) } : {}),
      revision: row.revision,
      deviceId: row.device_id,
      serverTimestamp: row.server_timestamp,
    }));
    return jsonResponse({
      version: 2,
      epoch: meta.epoch,
      cursor: page.length ? page.at(-1).revision : meta.head_revision,
      hasMore,
      reset: false,
      acceptedMutationIds,
      changes,
    });
  }

  async clear(request) {
    let body = {};
    try { body = await request.json(); } catch { /* An empty body is valid. */ }
    await this.ensureImported();
    const meta = this.metadata();
    if (body.epoch != null && body.epoch !== meta.epoch) {
      return jsonResponse({ error: "stale_epoch", epoch: meta.epoch }, 409);
    }
    const now = Date.now();
    const epoch = meta.epoch + 1;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM entities");
      this.sql.exec("DELETE FROM changes");
      this.sql.exec("DELETE FROM processed_mutations");
      this.sql.exec(
        `UPDATE metadata SET epoch = ?, head_revision = 0, min_revision = 1,
         claimed = 1, last_activity = ?, expires_at = ? WHERE singleton = 1`,
        epoch,
        now,
        now + SYNC_TTL_MS,
      );
    });
    await this.touchAlarm(now);
    return jsonResponse({
      version: 2,
      epoch,
      cursor: 0,
      hasMore: false,
      reset: true,
      acceptedMutationIds: [],
      snapshot: { sessions: [], attempts: [], excludedQuestions: [] },
    });
  }

  async legacyGet() {
    await this.ensureImported();
    if (!this.metadata().claimed) return new Response("Not found", { status: 404 });
    const snapshot = this.snapshot();
    return jsonResponse({ version: 1, exported_at: Date.now(), ...snapshot });
  }

  async legacyPut(request) {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_SYNC_PAYLOAD_BYTES) {
      return new Response("Payload too large.", { status: 413 });
    }
    let payload;
    try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON body.", { status: 400 }); }
    if (!validateV1Payload(payload)) return new Response("Invalid sync payload shape.", { status: 400 });
    await this.ensureImported();
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.importLegacy(payload, "legacy-client", now);
      this.compact(now);
      this.sql.exec(
        "UPDATE metadata SET claimed = 1, last_activity = ?, expires_at = ? WHERE singleton = 1",
        now,
        now + SYNC_TTL_MS,
      );
    });
    await this.touchAlarm(now);
    return new Response("ok");
  }

  async fetch(request) {
    this.key = new URL(request.url).searchParams.get("key") ?? request.headers.get("X-Sync-Key") ?? this.key;
    // Production proxies send the key header. Tests may set instance.key directly.
    if (!this.key) return new Response("Missing sync key", { status: 400 });
    const path = new URL(request.url).pathname;
    if (path === "/claim" && request.method === "POST") return this.claim();
    if (path === "/exchange" && request.method === "POST") return this.exchange(request);
    if (path === "/clear" && request.method === "POST") return this.clear(request);
    if (path === "/legacy" && request.method === "GET") return this.legacyGet();
    if (path === "/legacy" && request.method === "PUT") return this.legacyPut(request);
    return new Response("Not found", { status: 404 });
  }

  async alarm() {
    const meta = this.metadata();
    if (!meta) return;
    const now = Date.now();
    if (meta.expires_at > now) {
      await this.ctx.storage.setAlarm(meta.expires_at);
      return;
    }
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM entities");
      this.sql.exec("DELETE FROM changes");
      this.sql.exec("DELETE FROM processed_mutations");
      // Retain only a tiny migration/epoch marker. Removing metadata entirely
      // would let an old KV snapshot be imported again, and resetting the epoch
      // to 1 would let a stale offline device resurrect expired history.
      this.sql.exec(
        `UPDATE metadata SET epoch = ?, head_revision = 0, min_revision = 1,
         claimed = 0, last_activity = ?, expires_at = 0 WHERE singleton = 1`,
        meta.epoch + 1,
        now,
      );
    });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // POST /push/subscribe | /push/unsubscribe — daily practice reminders
    if (parts[0] === "push" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response("Too many requests", { status: 429, headers: CORS });
      }
      if (parts[1] === "subscribe") return handlePushSubscribe(request, env);
      if (parts[1] === "unsubscribe") return handlePushUnsubscribe(request, env);
      if (parts[1] === "test") return handlePushTest(request, env);
      if (parts[1] === "mark-practiced") return handleMarkPracticed(request, env);
      return new Response("Not found", { status: 404, headers: CORS });
    }

    // POST /revision/ask — AI Q&A scoped to a single revision topic
    if (parts[0] === "revision" && parts[1] === "ask" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const { success } = await env.AI_RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response("You've hit this site's AI request limit. Wait a minute and try again.", {
          status: 429,
          headers: CORS,
        });
      }
      return handleRevisionAsk(request, env);
    }

    // POST /sync/create — custom key creation (must come before the key handler)
    if (parts[0] === "sync" && parts[1] === "create" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response("Too many requests", { status: 429, headers: CORS });
      }
      return handleCreate(request, env);
    }

    // POST /sync/v2/:key/exchange | /clear
    if (parts[0] === "sync" && parts[1] === "v2" && parts[2] && parts[3]) {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return new Response("Too many requests", { status: 429, headers: CORS });
      const key = parts[2].trim().toLowerCase();
      if (!/^[a-z]{2,20}-[a-z]{2,20}-\d{4,5}$/.test(key)) {
        return new Response("Invalid sync key.", { status: 400, headers: CORS });
      }
      if (/^amber-forest-\d{4}$/.test(key)) {
        return new Response("Nice try. That's the example key - generate a real one.", { status: 418, headers: CORS });
      }
      if (!env.SYNC_DOCUMENTS) {
        return new Response("Automatic sync is not configured.", { status: 503, headers: CORS });
      }
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });
      if (parts[3] === "exchange") return proxySyncDocument(request, env, key, "exchange");
      if (parts[3] === "clear") return proxySyncDocument(request, env, key, "clear");
      return new Response("Not found", { status: 404, headers: CORS });
    }

    if (parts[0] !== "sync" || !parts[1]) {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response("Too many requests", { status: 429, headers: CORS });
    }

    const key = parts[1];

    // "create" is a reserved path segment, not a valid key.
    if (key === "create") {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    if (/^amber-forest-\d{4}$/.test(key)) {
      return new Response("Nice try. That's the example key - generate a real one.", { status: 418, headers: CORS });
    }

    if (request.method === "GET") {
      if (env.SYNC_DOCUMENTS) return proxySyncDocument(request, env, key, "legacy");
      const value = await env.KV.get(key);
      if (value === null || value === "__reserved__") {
        return new Response("Not found", { status: 404, headers: CORS });
      }
      return new Response(value, {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (request.method === "PUT") {
      if (env.SYNC_DOCUMENTS) return proxySyncDocument(request, env, key, "legacy");
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > MAX_SYNC_PAYLOAD_BYTES) {
        return new Response("Payload too large.", { status: 413, headers: CORS });
      }
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return new Response("Invalid JSON body.", { status: 400, headers: CORS });
      }
      if (!validateV1Payload(parsed)) {
        return new Response("Invalid sync payload shape.", { status: 400, headers: CORS });
      }
      await env.KV.put(key, body, { expirationTtl: 31_536_000 });
      return new Response("ok", { status: 200, headers: CORS });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runReminderSweep(env));
  },
};

// Exported for unit tests.
export { runReminderSweep };
