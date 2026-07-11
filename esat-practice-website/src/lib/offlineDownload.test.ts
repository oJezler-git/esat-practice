import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getOfflineDownloadState,
  getCurrentDataVersion,
  downloadAllImagesForOffline,
  clearOfflineImageCache,
  OFFLINE_IMAGES_CACHE,
} from "./offlineDownload";
import { makeQuestion as makeDbQuestion } from "../test-utils/factories";

vi.mock("./questionStore");
import { listQuestionsFromDb } from "./questionStore";

function makeQuestion(imageUrl?: string, id = imageUrl ?? "question-without-image") {
  return makeDbQuestion({ id, content: { image_url: imageUrl } });
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
  it("returns zero without throwing when the Cache API is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/q1.png"),
    ]);

    const onProgress = vi.fn();
    const count = await downloadAllImagesForOffline(onProgress);

    expect(count).toBe(0);
    expect(onProgress).toHaveBeenCalledWith(0, 1);
    expect(localStorage.getItem("offline_images_state")).toBeNull();
  });

  it("treats relative URLs as cache hits after normalizing against location.href", async () => {
    const absoluteUrl = new URL("/img/q1.png", location.href).href;
    const cache = makeCache([absoluteUrl]);
    const mockFetch = makeFetch();
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/q1.png"),
    ]);

    const count = await downloadAllImagesForOffline(vi.fn());

    expect(mockFetch).toHaveBeenCalledWith("/data/manifest.json", { cache: "no-store" });
    expect(mockFetch).not.toHaveBeenCalledWith("/img/q1.png");
    expect(cache.put).not.toHaveBeenCalled();
    expect(count).toBe(1);
  });

  it("fires progress with the initial cache-hit count before downloading", async () => {
    const cache = makeCache(["https://cdn.example.com/img/q1.png"]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("https://cdn.example.com/img/q1.png"),
    ]);

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
    ]);

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
    ]);

    const count = await downloadAllImagesForOffline(vi.fn());

    expect(cache.put).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });

  it("does not cache non-OK image fetch responses", async () => {
    const cache = makeCache([]);
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("manifest")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: "2026-01-01" }),
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/q1.png"),
    ]);

    const count = await downloadAllImagesForOffline(vi.fn());

    expect(cache.put).not.toHaveBeenCalled();
    expect(count).toBe(1);
  });

  it("continues when cache.put rejects for an image", async () => {
    const cache = makeCache([]);
    cache.put.mockRejectedValueOnce(new Error("quota exceeded"));
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/q1.png"),
      makeQuestion("/img/q2.png"),
    ]);

    const calls: [number, number][] = [];
    const count = await downloadAllImagesForOffline((done, total) => calls.push([done, total]));

    expect(cache.put).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
    expect(calls[calls.length - 1]).toEqual([2, 2]);
  });

  it("deduplicates image URLs", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch());
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/shared.png", "q1"),
      makeQuestion("/img/shared.png", "q2"),
    ]);

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
    ]);

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
      Array.from({ length: 8 }, (_, i) => makeQuestion(`/img/q${i}.png`)),
    );

    const controller = new AbortController();
    controller.abort();

    await downloadAllImagesForOffline(vi.fn(), controller.signal);

    expect(cache.put).not.toHaveBeenCalled();
  });

  it("stops before the next batch when aborted during a partially completed batch", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

    const controller = new AbortController();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("manifest")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: "2026-01-01" }),
        });
      }
      controller.abort();
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(listQuestionsFromDb).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => makeQuestion(`/img/q${i}.png`)),
    );

    const count = await downloadAllImagesForOffline(vi.fn(), controller.signal);

    expect(cache.put).toHaveBeenCalledTimes(6);
    expect(mockFetch).toHaveBeenCalledTimes(7);
    expect(count).toBe(6);
  });

  it("saves state to localStorage after completion", async () => {
    const cache = makeCache([]);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", makeFetch("2026-05"));
    vi.mocked(listQuestionsFromDb).mockResolvedValue([
      makeQuestion("/img/q1.png"),
    ]);

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
    ]);

    const calls: [number, number][] = [];
    await downloadAllImagesForOffline((done, total) => calls.push([done, total]));

    // Initial call (0 cached), then 1/2, then 2/2
    expect(calls[0]).toEqual([0, 2]);
    expect(calls[calls.length - 1]).toEqual([2, 2]);
  });
});
