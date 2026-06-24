const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

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
};
