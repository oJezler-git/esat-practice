const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "sync" || !parts[1]) {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response("Too many requests", { status: 429, headers: CORS });
    }

    const key = parts[1];

    if (/^amber-forest-\d{4}$/.test(key)) {
      return new Response("Nice try. That's the example key - generate a real one.", { status: 418, headers: CORS });
    }

    if (request.method === "GET") {
      const value = await env.KV.get(key);
      if (value === null) {
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
