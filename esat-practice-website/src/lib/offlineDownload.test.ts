import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getOfflineDownloadState,
  getCurrentDataVersion,
  downloadAllImagesForOffline,
  clearOfflineImageCache,
  OFFLINE_IMAGES_CACHE,
} from "./offlineDownload";

vi.mock("./questionStore");
import { listQuestionsFromDb } from "./questionStore";

function makeQuestion(imageUrl?: string) {
  return { content: { text: "Q", image_url: imageUrl } };
}

function makeCache(existingAbsoluteUrls: string[] = []) {
  return {
    keys: vi.fn().mockResolvedValue(existingAbsoluteUrls.map((url) => ({ url }))),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFetch(version = "2026-01-01") {
  return vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("manifest")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ version }),
      });
    }
    return Promise.resolve({ ok: true });
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getOfflineDownloadState", () => {
  it("returns null when nothing is stored", () => {
    expect(getOfflineDownloadState()).toBeNull();
  });

  it("parses and returns stored state", () => {
    const state = { downloadedAt: 1000, count: 5, dataVersion: "2026-01-01" };
    localStorage.setItem("offline_images_state", JSON.stringify(state));
    expect(getOfflineDownloadState()).toEqual(state);
  });

  it("returns null for invalid JSON", () => {
    localStorage.setItem("offline_images_state", "{not-json}");
    expect(getOfflineDownloadState()).toBeNull();
  });
});

describe("getCurrentDataVersion", () => {
  it("fetches the manifest with no-store cache and returns the version", async () => {
    const mockFetch = makeFetch("2026-03-15");
    vi.stubGlobal("fetch", mockFetch);

    const version = await getCurrentDataVersion();
    expect(version).toBe("2026-03-15");
    expect(mockFetch).toHaveBeenCalledWith("/data/manifest.json", { cache: "no-store" });
  });

  it("returns 'unknown' when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    expect(await getCurrentDataVersion()).toBe("unknown");
  });

  it("returns 'unknown' when the manifest has no version field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));
    expect(await getCurrentDataVersion()).toBe("unknown");
  });
});

describe("clearOfflineImageCache", () => {
  it("deletes the cache and removes the localStorage state key", async () => {
    localStorage.setItem("offline_images_state", "{}");
    const mockCaches = {
      delete: vi.fn().mockResolvedValue(true),
      open: vi.fn(),
    };
    vi.stubGlobal("caches", mockCaches);

    await clearOfflineImageCache();

    expect(mockCaches.delete).toHaveBeenCalledWith(OFFLINE_IMAGES_CACHE);
    expect(localStorage.getItem("offline_images_state")).toBeNull();
  });
});

describe("downloadAllImagesForOffline", () => {
  it("fires progress with the initial cache-hit count before downloading", async () => {
    const cache = makeCache(["https://cdn.example.com/img/q1.png"]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("https://cdn.example.com/img/q1.png"),
    ] as any);

    const onProgress = vi.fn();
    await downloadAllImagesForOffline(onProgress);

    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });

  it("skips images already in cache and does not fetch them", async () => {
    const cache = makeCache(["https://cdn.example.com/img/q1.png"]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("https://cdn.example.com/img/q1.png"),
    ] as any);

    const count = await downloadAllImagesForOffline(vi.fn());

    expect(cache.put).not.toHaveBeenCalled();
    expect(count).toBe(1);
  });

  it("fetches and caches pending images", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/q1.png"),
      makeQuestion("/img/q2.png"),
    ] as any);

    const count = await downloadAllImagesForOffline(vi.fn());

    expect(cache.put).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });

  it("deduplicates image URLs", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/shared.png"),
      makeQuestion("/img/shared.png"),
    ] as any);

    const count = await downloadAllImagesForOffline(vi.fn());

    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(count).toBe(1);
  });

  it("skips questions with no image URL", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion(undefined),
      makeQuestion("/img/q1.png"),
    ] as any);

    const count = await downloadAllImagesForOffline(vi.fn());

    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(count).toBe(1);
  });

  it("stops processing batches when signal is already aborted", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    // 8 questions forces 2 batches (BATCH_SIZE = 6)
    vi.mocked(listQuestionsFromDb).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => makeQuestion(`/img/q${i}.png`)) as any,
    );

    const controller = new AbortController();
    controller.abort();

    await downloadAllImagesForOffline(vi.fn(), controller.signal);

    expect(cache.put).not.toHaveBeenCalled();
  });

  it("saves state to localStorage after completion", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch("2026-05"));
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/q1.png"),
    ] as any);

    await downloadAllImagesForOffline(vi.fn());

    const stored = JSON.parse(localStorage.getItem("offline_images_state")!);
    expect(stored.dataVersion).toBe("2026-05");
    expect(stored.count).toBe(1);
    expect(typeof stored.downloadedAt).toBe("number");
  });

  it("reports progress incrementally as images are downloaded", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/q1.png"),
      makeQuestion("/img/q2.png"),
    ] as any);

    const calls: [number, number][] = [];
    await downloadAllImagesForOffline((done, total) => calls.push([done, total]));

    // Initial call (0 cached), then 1/2, then 2/2
    expect(calls[0]).toEqual([0, 2]);
    expect(calls[calls.length - 1]).toEqual([2, 2]);
  });
});
