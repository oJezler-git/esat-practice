import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSyncKey,
  getSyncKey,
  setSyncKey,
  getLastPush,
  createSyncKeyWithWords,
  pushToCloud,
  pullFromCloud,
  SYNC_KEY_STORAGE_KEY,
  ADJECTIVES,
  NOUNS,
} from "./cloudSync";
import { getDb } from "./db";

vi.mock("./db");

const SYNC_KEY_PATTERN = /^[a-z]+-[a-z]+-\d{4}$/;
const TEST_API_URL = "https://test-sync.example.com";

function createMockDb() {
  const store = {
    getAll: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const tx = {
    objectStore: vi.fn().mockReturnValue(store),
    done: Promise.resolve(),
  };
  const db = { transaction: vi.fn().mockReturnValue(tx) };
  return { db, tx, store };
}

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: vi.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  });
}

describe("getSyncKey / setSyncKey / getLastPush", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getSyncKey returns null when nothing is stored", () => {
    expect(getSyncKey()).toBeNull();
  });

  it("setSyncKey stores the key and getSyncKey retrieves it", () => {
    setSyncKey("amber-forest-1234");
    expect(getSyncKey()).toBe("amber-forest-1234");
  });

  it("setSyncKey trims surrounding whitespace", () => {
    setSyncKey("  amber-forest-1234  ");
    expect(getSyncKey()).toBe("amber-forest-1234");
  });

  it("getLastPush returns null when nothing is stored", () => {
    expect(getLastPush()).toBeNull();
  });

  it("getLastPush returns a number after a push timestamp is stored", () => {
    localStorage.setItem("esat-sync-last-push", "1700000000000");
    expect(getLastPush()).toBe(1700000000000);
  });
});

describe("generateSyncKey", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns a key matching the adjective-noun-NNNN pattern", () => {
    const key = generateSyncKey();
    expect(key).toMatch(SYNC_KEY_PATTERN);
  });

  it("stores the generated key in localStorage", () => {
    const key = generateSyncKey();
    expect(localStorage.getItem(SYNC_KEY_STORAGE_KEY)).toBe(key);
  });

  it("uses words from the ADJECTIVES and NOUNS lists", () => {
    const key = generateSyncKey();
    const [adj, noun] = key.split("-");
    expect(ADJECTIVES).toContain(adj);
    expect(NOUNS).toContain(noun);
  });

  it("4-digit suffix is between 1000 and 9999", () => {
    for (let i = 0; i < 20; i++) {
      const key = generateSyncKey();
      const digits = parseInt(key.split("-")[2], 10);
      expect(digits).toBeGreaterThanOrEqual(1000);
      expect(digits).toBeLessThanOrEqual(9999);
    }
  });
});

describe("createSyncKeyWithWords", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_SYNC_API_URL", TEST_API_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("POSTs to /sync/create with the trimmed words", async () => {
    const fetchMock = mockFetchResponse({ key: "amber-forest-1234" });
    vi.stubGlobal("fetch", fetchMock);

    await createSyncKeyWithWords("  amber-forest  ");

    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_API_URL}/sync/create`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ words: "amber-forest" }),
      })
    );
  });

  it("stores the returned key in localStorage and returns it", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({ key: "amber-forest-1234" }));

    const key = await createSyncKeyWithWords("amber-forest");

    expect(key).toBe("amber-forest-1234");
    expect(localStorage.getItem(SYNC_KEY_STORAGE_KEY)).toBe("amber-forest-1234");
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", mockFetchResponse("Rate limit exceeded", false, 429));

    await expect(createSyncKeyWithWords("amber-forest")).rejects.toThrow("Rate limit exceeded");
  });

  it("throws when the server returns no key", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({}));

    await expect(createSyncKeyWithWords("amber-forest")).rejects.toThrow("no key");
  });

  it("throws when VITE_SYNC_API_URL is not set", async () => {
    vi.stubEnv("VITE_SYNC_API_URL", "");

    await expect(createSyncKeyWithWords("amber-forest")).rejects.toThrow("VITE_SYNC_API_URL");
  });
});

describe("pushToCloud", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_SYNC_API_URL", TEST_API_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("PUTs exported data to the correct URL for the key", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    const fetchMock = mockFetchResponse("OK");
    vi.stubGlobal("fetch", fetchMock);

    await pushToCloud("amber-forest-1234");

    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_API_URL}/sync/amber-forest-1234`,
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("URL-encodes the key", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    const fetchMock = mockFetchResponse("OK");
    vi.stubGlobal("fetch", fetchMock);

    await pushToCloud("amber forest 1234");

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain(encodeURIComponent("amber forest 1234"));
  });

  it("writes the payload body as JSON including version and exported_at", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    const fetchMock = mockFetchResponse("OK");
    vi.stubGlobal("fetch", fetchMock);

    await pushToCloud("amber-forest-1234");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.version).toBe(1);
    expect(typeof body.exported_at).toBe("number");
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(Array.isArray(body.attempts)).toBe(true);
    expect(Array.isArray(body.stats)).toBe(true);
    expect(Array.isArray(body.excludedQuestions)).toBe(true);
  });

  it("updates the last-push timestamp in localStorage on success", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.stubGlobal("fetch", mockFetchResponse("OK"));

    const before = Date.now();
    await pushToCloud("amber-forest-1234");
    const after = Date.now();

    const stored = getLastPush();
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(after);
  });

  it("throws when the response is not ok", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.stubGlobal("fetch", mockFetchResponse("Unauthorized", false, 401));

    await expect(pushToCloud("amber-forest-1234")).rejects.toThrow("Unauthorized");
  });

  it("reads all four object stores from the db", async () => {
    const { db, tx } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.stubGlobal("fetch", mockFetchResponse("OK"));

    await pushToCloud("amber-forest-1234");

    expect(db.transaction).toHaveBeenCalledWith(
      expect.arrayContaining(["sessions", "attempts", "stats", "excludedQuestions"]),
      "readonly"
    );
    expect(tx.objectStore).toHaveBeenCalledWith("sessions");
    expect(tx.objectStore).toHaveBeenCalledWith("attempts");
    expect(tx.objectStore).toHaveBeenCalledWith("stats");
    expect(tx.objectStore).toHaveBeenCalledWith("excludedQuestions");
  });
});

describe("pullFromCloud", () => {
  const validPayload = {
    version: 1 as const,
    exported_at: Date.now(),
    sessions: [{ id: "s1" }],
    attempts: [{ id: "a1" }],
    stats: [{ topic: "Math" }],
    excludedQuestions: [],
  };

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_SYNC_API_URL", TEST_API_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("GETs from the correct URL for the key", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    const fetchMock = mockFetchResponse(validPayload);
    vi.stubGlobal("fetch", fetchMock);

    await pullFromCloud("amber-forest-1234");

    expect(fetchMock).toHaveBeenCalledWith(`${TEST_API_URL}/sync/amber-forest-1234`);
  });

  it("clears all stores then writes payload records", async () => {
    const { db, tx, store } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.stubGlobal("fetch", mockFetchResponse(validPayload));

    await pullFromCloud("amber-forest-1234");

    expect(db.transaction).toHaveBeenCalledWith(
      expect.arrayContaining(["sessions", "attempts", "stats", "excludedQuestions"]),
      "readwrite"
    );
    expect(store.clear).toHaveBeenCalledTimes(4);
    expect(store.put).toHaveBeenCalledWith(validPayload.sessions[0]);
    expect(store.put).toHaveBeenCalledWith(validPayload.attempts[0]);
    expect(store.put).toHaveBeenCalledWith(validPayload.stats[0]);
  });

  it("throws a descriptive error on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: vi.fn().mockResolvedValue("Not Found") })
    );

    await expect(pullFromCloud("amber-forest-1234")).rejects.toThrow(/No data found/);
  });

  it("throws the server error text for non-404 failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: vi.fn().mockResolvedValue("Internal Server Error") })
    );

    await expect(pullFromCloud("amber-forest-1234")).rejects.toThrow("Internal Server Error");
  });

  it("throws for unsupported payload version", async () => {
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.stubGlobal("fetch", mockFetchResponse({ ...validPayload, version: 2 }));

    await expect(pullFromCloud("amber-forest-1234")).rejects.toThrow(/Unsupported sync payload version/);
  });
});
