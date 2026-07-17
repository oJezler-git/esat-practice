import revisionContext from "./revision-context.json";
import { sendPushNotification } from "./web-push.js";
import {
  PUSH_KEY_PREFIX,
  isValidSubscription,
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

// Wider than the 15-minute cron interval (wrangler.toml) so a delayed or skipped
// tick still catches the reminder on the next run. Per-day dedupe (lastSent)
// prevents the overlap from sending twice.
const REMINDER_WINDOW_MINUTES = 20;

// Statuses the push service returns for a request that will never succeed no
// matter how many times it's retried (bad/expired subscription, malformed
// request, oversized payload). Anything else (429, 5xx, network errors) is
// treated as transient and left to retry on the next cron tick.
const PERMANENT_FAILURE_STATUSES = new Set([400, 401, 403, 404, 410, 413]);

const REMINDER_PAYLOAD = JSON.stringify({
  title: "Time to practise",
  body: "A few ESAT questions now keeps you sharp. Jump back in →",
  url: "/practice",
  tag: "esat-reminder",
});

const TEST_PAYLOAD = JSON.stringify({
  title: "Test notification",
  body: "If you can see this, your reminders are set up correctly.",
  url: "/settings",
  tag: "esat-test",
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

  // Try to claim a slot by writing a sentinel immediately after finding it free.
  // KV has no compare-and-swap, so the window between get and put is not zero,
  // but it is milliseconds rather than seconds, making collisions negligible in practice.
  // The sentinel is filtered out in GET so a pull before first push still returns 404.
  async function tryClaimSlot(candidate) {
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
    // Astronomically unlikely — claim without checking.
    const num = String(Math.floor(10000 + Math.random() * 90000));
    key = `${words}-${num}`;
    await env.KV.put(key, "__reserved__", { expirationTtl: 3600 });
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
  // Preserve lastSent if this device already has a record, so changing the
  // reminder time mid-day doesn't cause a duplicate notification.
  const existingRaw = await env.KV.get(key);
  if (existingRaw) {
    try {
      record.lastSent = JSON.parse(existingRaw).lastSent ?? null;
    } catch {
      // Corrupt record — overwrite it fresh.
    }
  }
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
          REMINDER_PAYLOAD,
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
      const body = await request.text();
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
