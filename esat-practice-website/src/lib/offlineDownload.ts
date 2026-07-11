import { listQuestionsFromDb } from "./questionStore";

export const OFFLINE_IMAGES_CACHE = "esat-images";
const STORAGE_KEY = "offline_images_state";
const BATCH_SIZE = 6;

export interface OfflineDownloadState {
  downloadedAt: number;
  count: number;
  dataVersion: string;
}

export function getOfflineDownloadState(): OfflineDownloadState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OfflineDownloadState;
  } catch {
    return null;
  }
}

export async function getCurrentDataVersion(): Promise<string> {
  try {
    const res = await fetch("/data/manifest.json", { cache: "no-store" });
    const json = (await res.json()) as { version?: string };
    return json.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function downloadAllImagesForOffline(
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const [questions, dataVersion] = await Promise.all([
    listQuestionsFromDb(),
    getCurrentDataVersion(),
  ]);
  const urls = [
    ...new Set(
      questions
        .map((q) => q.content.image_url)
        .filter((url): url is string => Boolean(url)),
    ),
  ];

  if (typeof caches === "undefined" || typeof caches.open !== "function") {
    onProgress(0, urls.length);
    return 0;
  }

  const cache = await caches.open(OFFLINE_IMAGES_CACHE);
  const existing = new Set((await cache.keys()).map((req) => req.url));

  const pending = urls.filter((url) => {
    const abs = new URL(url, location.href).href;
    return !existing.has(abs);
  });

  let done = urls.length - pending.length;
  onProgress(done, urls.length);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch {
          // ignore individual failures
        }
        done++;
        onProgress(done, urls.length);
      }),
    );
  }

  const state: OfflineDownloadState = { downloadedAt: Date.now(), count: done, dataVersion };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return done;
}

export async function clearOfflineImageCache(): Promise<void> {
  await caches.delete(OFFLINE_IMAGES_CACHE);
  localStorage.removeItem(STORAGE_KEY);
}
