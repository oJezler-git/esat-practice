import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "./sync-worker.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function makeEnv({
  kvGetResult = null,
  kvPutResult = undefined,
  rateLimitSuccess = true,
  aiRateLimitSuccess = true,
  geminiApiKey = "test-key",
} = {}) {
  return {
    KV: {
      get: vi.fn().mockResolvedValue(kvGetResult),
      put: vi.fn().mockResolvedValue(kvPutResult),
    },
    RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: rateLimitSuccess }),
    },
    AI_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: aiRateLimitSuccess }),
    },
    GEMINI_API_KEY: geminiApiKey,
  };
}

function makeRequest(path, { method = "GET", body, headers = {} } = {}) {
  const url = `https://sync.example.com${path}`;
  const allHeaders = { "CF-Connecting-IP": "1.2.3.4", ...headers };
  if (body !== undefined && !allHeaders["Content-Type"]) {
    allHeaders["Content-Type"] = "application/json";
  }
  const init = { method, headers: allHeaders };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(url, init);
}

describe("CORS preflight (OPTIONS)", () => {
  it("returns 204 with CORS headers", async () => {
    const res = await worker.fetch(
      makeRequest("/sync/my-key", { method: "OPTIONS" }),
      makeEnv(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});

describe("GET /sync/:key", () => {
  it("returns 200 with stored JSON when the key exists", async () => {
    const env = makeEnv({ kvGetResult: '{"sessions":[]}' });
    const res = await worker.fetch(makeRequest("/sync/my-key-5678"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"sessions":[]}');
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("returns 404 when the key is not found in KV", async () => {
    const env = makeEnv({ kvGetResult: null });
    const res = await worker.fetch(makeRequest("/sync/missing-key-1234"), env);
    expect(res.status).toBe(404);
  });

  it("returns 404 when KV holds the __reserved__ sentinel", async () => {
    const env = makeEnv({ kvGetResult: "__reserved__" });
    const res = await worker.fetch(makeRequest("/sync/my-key-1234"), env);
    expect(res.status).toBe(404);
  });

  it("returns 418 for the amber-forest-NNNN example key", async () => {
    const res = await worker.fetch(makeRequest("/sync/amber-forest-1234"), makeEnv());
    expect(res.status).toBe(418);
  });

  it("returns 404 when GET targets the reserved path segment 'create'", async () => {
    const res = await worker.fetch(makeRequest("/sync/create"), makeEnv());
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unrecognised root path", async () => {
    const res = await worker.fetch(makeRequest("/unknown/path"), makeEnv());
    expect(res.status).toBe(404);
  });
});

describe("PUT /sync/:key", () => {
  const validPayload = JSON.stringify({
    version: 1,
    exported_at: Date.now(),
    sessions: [],
    attempts: [],
    excludedQuestions: [],
  });

  it("stores the body with a 1-year TTL and returns 200", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest("/sync/my-key-5678", { method: "PUT", body: validPayload }),
      env,
    );
    expect(res.status).toBe(200);
    expect(env.KV.put).toHaveBeenCalledWith(
      "my-key-5678",
      validPayload,
      { expirationTtl: 31_536_000 },
    );
  });

  it("returns 400 for a body that isn't valid JSON", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest("/sync/my-key-5678", { method: "PUT", body: "not json" }),
      env,
    );
    expect(res.status).toBe(400);
    expect(env.KV.put).not.toHaveBeenCalled();
  });

  it("returns 400 for JSON that doesn't match the sync payload shape", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest("/sync/my-key-5678", { method: "PUT", body: '{"hello":"world"}' }),
      env,
    );
    expect(res.status).toBe(400);
    expect(env.KV.put).not.toHaveBeenCalled();
  });

  it("returns 413 for an oversized payload", async () => {
    const env = makeEnv();
    const huge = JSON.stringify({
      version: 1,
      exported_at: Date.now(),
      sessions: [],
      attempts: [],
      excludedQuestions: [],
      padding: "x".repeat(2_000_001),
    });
    const res = await worker.fetch(
      makeRequest("/sync/my-key-5678", { method: "PUT", body: huge }),
      env,
    );
    expect(res.status).toBe(413);
    expect(env.KV.put).not.toHaveBeenCalled();
  });
});

describe("Method not allowed", () => {
  it("returns 405 for an unsupported method on a data key", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest("/sync/my-key-5678", { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(405);
  });
});

describe("Rate limiting", () => {
  it("returns 429 on GET when the rate limit is exceeded", async () => {
    const env = makeEnv({ rateLimitSuccess: false });
    const res = await worker.fetch(makeRequest("/sync/my-key-1234"), env);
    expect(res.status).toBe(429);
  });

  it("returns 429 on PUT when the rate limit is exceeded", async () => {
    const env = makeEnv({ rateLimitSuccess: false });
    const res = await worker.fetch(
      makeRequest("/sync/my-key-1234", { method: "PUT", body: "{}" }),
      env,
    );
    expect(res.status).toBe(429);
  });
});

describe("POST /sync/create — validation", () => {
  it("returns 400 for an invalid JSON body", async () => {
    const req = new Request("https://sync.example.com/sync/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "1.2.3.4",
      },
      body: "not valid json {{{",
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 when words has no hyphen", async () => {
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "amberforest" } }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when words has more than one hyphen", async () => {
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "amber-forest-hill" } }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when a word contains digits", async () => {
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "amber1-forest" } }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when a word is shorter than 2 characters", async () => {
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "a-forest" } }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when a word is longer than 20 characters", async () => {
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "amber-abcdefghijklmnopqrstu" } }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited on create", async () => {
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "cool-words" } }),
      makeEnv({ rateLimitSuccess: false }),
    );
    expect(res.status).toBe(429);
  });
});

describe("POST /sync/create — key generation", () => {
  it("returns 200 with a {key} body matching the expected pattern", async () => {
    const env = makeEnv({ kvGetResult: null }); // all candidate slots are free
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "cool-words" } }),
      env,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.key).toMatch(/^cool-words-\d{4,5}$/);
  });

  it("trims whitespace from words before processing", async () => {
    const env = makeEnv({ kvGetResult: null });
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "  cool-words  " } }),
      env,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.key).toMatch(/^cool-words-\d{4,5}$/);
  });

  it("uses a 5-digit suffix for reserved pair words (skips 4-digit space)", async () => {
    const env = makeEnv({ kvGetResult: null });
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "amber-forest" } }),
      env,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.key).toMatch(/^amber-forest-\d{5}$/);
  });

  it("falls back to a 5-digit suffix when all 4-digit slots appear taken", async () => {
    // Every get returns a non-null value → no 4-digit slot is free
    let callCount = 0;
    const env = {
      KV: {
        get: vi.fn().mockImplementation(() => {
          callCount++;
          // Return non-null for the first 50 calls (4-digit exhaustion), then null
          return Promise.resolve(callCount <= 50 ? "occupied" : null);
        }),
        put: vi.fn().mockResolvedValue(undefined),
      },
      RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    const res = await worker.fetch(
      makeRequest("/sync/create", { method: "POST", body: { words: "cool-words" } }),
      env,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.key).toMatch(/^cool-words-\d{5}$/);
  });
});

describe("POST /revision/ask", () => {
  function mockGeminiResponse(text) {
    return vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  it("returns 400 for an invalid JSON body", async () => {
    const req = new Request("https://sync.example.com/revision/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
      body: "not valid json {{{",
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty question", async () => {
    const res = await worker.fetch(
      makeRequest("/revision/ask", { method: "POST", body: { moduleSlug: "m1", topicSlug: "units", question: "  " } }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a question over the length limit", async () => {
    const res = await worker.fetch(
      makeRequest("/revision/ask", {
        method: "POST",
        body: { moduleSlug: "m1", topicSlug: "units", question: "a".repeat(401) },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown topic", async () => {
    const res = await worker.fetch(
      makeRequest("/revision/ask", {
        method: "POST",
        body: { moduleSlug: "nope", topicSlug: "nope", question: "What is a unit?" },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 503 when GEMINI_API_KEY is not configured", async () => {
    const res = await worker.fetch(
      makeRequest("/revision/ask", {
        method: "POST",
        body: { moduleSlug: "m1", topicSlug: "units", question: "What is a unit?" },
      }),
      makeEnv({ geminiApiKey: null }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 429 when the AI rate limit is exceeded", async () => {
    const res = await worker.fetch(
      makeRequest("/revision/ask", {
        method: "POST",
        body: { moduleSlug: "m1", topicSlug: "units", question: "What is a unit?" },
      }),
      makeEnv({ aiRateLimitSuccess: false }),
    );
    expect(res.status).toBe(429);
  });

  it("returns 200 with the answer text from Gemini on success", async () => {
    global.fetch = mockGeminiResponse("Use SI units and keep the number sensible.");
    const res = await worker.fetch(
      makeRequest("/revision/ask", {
        method: "POST",
        body: { moduleSlug: "m1", topicSlug: "units", question: "What is a unit?" },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.answer).toBe("Use SI units and keep the number sensible.");

    const [, requestInit] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.system_instruction.parts[0].text).toContain("Units");
    expect(sentBody.contents.at(-1)).toEqual({ role: "user", parts: [{ text: "What is a unit?" }] });
  });

  it("returns 502 when Gemini responds with a non-OK status", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 }));
    const res = await worker.fetch(
      makeRequest("/revision/ask", {
        method: "POST",
        body: { moduleSlug: "m1", topicSlug: "units", question: "What is a unit?" },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(502);
  });

  it("returns 429 when Gemini itself rate-limits the request", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("busy", { status: 429 }));
    const res = await worker.fetch(
      makeRequest("/revision/ask", {
        method: "POST",
        body: { moduleSlug: "m1", topicSlug: "units", question: "What is a unit?" },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(429);
  });

  it("caps history to the last 4 turns and forwards them to Gemini", async () => {
    global.fetch = mockGeminiResponse("ok");
    const history = Array.from({ length: 6 }, (_, i) => ({ role: "user", text: `turn ${i}` }));
    await worker.fetch(
      makeRequest("/revision/ask", {
        method: "POST",
        body: { moduleSlug: "m1", topicSlug: "units", question: "final question", history },
      }),
      makeEnv(),
    );
    const [, requestInit] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.contents).toHaveLength(5); // 4 history turns + the new question
    expect(sentBody.contents[0].parts[0].text).toBe("turn 2");
  });
});
