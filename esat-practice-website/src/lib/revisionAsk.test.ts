import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askRevisionQuestion } from "./revisionAsk";

const TEST_API_URL = "https://sync.example.com";

function mockFetchResponse(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("askRevisionQuestion", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SYNC_API_URL", TEST_API_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses a successful JSON answer", async () => {
    mockFetchResponse(Response.json({ answer: "Use standard SI base units." }));

    await expect(askRevisionQuestion("m1", "units", "What are base units?")).resolves.toBe(
      "Use standard SI base units.",
    );
  });

  it("uses VITE_SYNC_API_URL without a trailing slash", async () => {
    vi.stubEnv("VITE_SYNC_API_URL", `${TEST_API_URL}/`);
    const fetchMock = mockFetchResponse(Response.json({ answer: "Done." }));

    await askRevisionQuestion("m1", "units", "Summarise", [{ role: "model", text: "Earlier answer" }]);

    expect(fetchMock).toHaveBeenCalledWith(`${TEST_API_URL}/revision/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleSlug: "m1",
        topicSlug: "units",
        question: "Summarise",
        history: [{ role: "model", text: "Earlier answer" }],
      }),
    });
  });

  it("throws non-OK response text", async () => {
    mockFetchResponse(new Response("Too many requests", { status: 429 }));

    await expect(askRevisionQuestion("m1", "units", "Help")).rejects.toThrow("Too many requests");
  });

  it("throws when the response JSON has no answer body", async () => {
    mockFetchResponse(Response.json({}));

    await expect(askRevisionQuestion("m1", "units", "Help")).rejects.toThrow(
      "The AI assistant did not return an answer.",
    );
  });

  it("throws before fetching when VITE_SYNC_API_URL is missing", async () => {
    vi.stubEnv("VITE_SYNC_API_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(askRevisionQuestion("m1", "units", "Help")).rejects.toThrow("VITE_SYNC_API_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
