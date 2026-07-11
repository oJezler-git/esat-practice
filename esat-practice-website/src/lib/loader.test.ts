import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pipelineSample from "../data/pipeline-sample.json";
import { normalizePipelinePayload } from "./loader";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./loadingProgress", () => ({
  setLoadingStage: vi.fn(),
  startPackLoading: vi.fn(),
  completePackLoading: vi.fn(),
  completeAllLoading: vi.fn(),
}));

const manifest = {
  version: "dataset-v2",
  generated_at: "2026-07-11T00:00:00.000Z",
  packs: [
    {
      id: "pack-a",
      path: "data/packs/a.json",
      question_count: 1,
      years: [2024],
      topics: ["Algebra"],
      papers: ["Paper A"],
      bytes: 100,
    },
    {
      id: "pack-b",
      path: "data/packs/b.json",
      question_count: 1,
      years: [2023],
      topics: ["Mechanics"],
      papers: ["Paper B"],
      bytes: 200,
    },
  ],
};

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: vi.fn().mockResolvedValue(payload) };
}

function makeDb() {
  const store = {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  return {
    count: vi.fn().mockResolvedValue(0),
    transaction: vi.fn().mockReturnValue({ store, done: Promise.resolve() }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  window.localStorage.clear();
  getDbMock.mockResolvedValue(makeDb());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("loader", () => {
  it("should normalize pipeline payload correctly", () => {
    const { questions, skipped } = normalizePipelinePayload(pipelineSample);

    expect(skipped).toBe(0);
    expect(questions.length).toBe(2);

    for (const question of questions) {
      expect(question.id.length).toBeGreaterThan(0);
      expect(question.source.paper.length).toBeGreaterThan(0);
      expect(question.content.text.length).toBeGreaterThan(0);
      expect(question.answer.correct).toMatch(/^[A-Z]$/);
      expect(question.meta.times_attempted).toBe(0);
      expect(question.meta.accuracy_rate).toBe(0);
    }
  });

  it("should handle malformed question records by skipping them", () => {
    const malformedPayload = {
      questions: [
        { id: "valid", text: "Some text" },
        { id: "invalid-no-text" },
        "not-an-object"
      ]
    };
    
    const { questions, skipped } = normalizePipelinePayload(malformedPayload);
    expect(questions).toHaveLength(1);
    expect(skipped).toBe(2);
    expect(questions[0].id).toBe("valid");
  });

  it("should handle empty or invalid payloads", () => {
    expect(normalizePipelinePayload(null).questions).toHaveLength(0);
    expect(normalizePipelinePayload({}).questions).toHaveLength(0);
    expect(normalizePipelinePayload([]).questions).toHaveLength(0);
  });

  it("should sanitize IDs and provide defaults for missing metadata", () => {
    const payload = {
      questions: [{
        id: "Question With Spaces!",
        text: "Content"
      }]
    };
    const { questions } = normalizePipelinePayload(payload);
    expect(questions[0].id).toBe("Question_With_Spaces");
    expect(questions[0].source.paper).toBe("Unknown Paper");
    expect(questions[0].taxonomy.primary_topic).toBe("Unclassified");
  });
});

describe("question data manifest and pack bootstrap", () => {
  it("loads and normalizes the published manifest without caching the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      ...manifest,
      packs: [{ ...manifest.packs[0], years: [2024, "2024"], topics: ["Algebra", "Algebra"] }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { loadQuestionDataManifest } = await import("./loader");

    const result = await loadQuestionDataManifest();

    expect(result).toMatchObject({ version: "dataset-v2", packs: [{ id: "pack-a" }] });
    expect(result.packs[0].years).toEqual([2024]);
    expect(result.packs[0].topics).toEqual(["Algebra"]);
    expect(fetchMock).toHaveBeenCalledWith("/data/manifest.json", { cache: "no-store" });
  });

  it("falls back to the embedded sample when the manifest request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { loadQuestionDataManifest } = await import("./loader");

    const result = await loadQuestionDataManifest();

    expect(result.version).toBe("embedded-sample-2026-03-30");
    expect(result.packs).toEqual([
      expect.objectContaining({ id: "pipeline-sample", path: "", question_count: 2 }),
    ]);
  });

  it("prefixes manifest and pack requests with VITE_DATA_BASE_URL and uses no-cache for packs", async () => {
    vi.stubEnv("VITE_DATA_BASE_URL", "https://cdn.example.test/questions///");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ...manifest, packs: [manifest.packs[0]] }))
      .mockResolvedValueOnce(jsonResponse({ questions: [{ id: "q1", text: "Question?" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { ensureQuestionPacksBootstrapped } = await import("./loader");

    await ensureQuestionPacksBootstrapped(["pack-a"]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://cdn.example.test/questions/data/manifest.json",
      { cache: "no-store" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://cdn.example.test/questions/data/packs/a.json",
      { cache: "no-cache" },
    );
  });

  it("invalidates loaded-pack state when the dataset version is stale", async () => {
    window.localStorage.setItem(
      "esat-practice:question-data-state",
      JSON.stringify({ version: "dataset-v1", loaded_pack_ids: ["pack-a"] }),
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(manifest))
      .mockResolvedValueOnce(jsonResponse({ questions: [{ id: "q1", text: "Question?" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { ensureQuestionPacksBootstrapped } = await import("./loader");

    await ensureQuestionPacksBootstrapped(["pack-a"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(window.localStorage.getItem("esat-practice:question-data-state") ?? "null"))
      .toEqual({ version: "dataset-v2", loaded_pack_ids: ["pack-a"] });
  });

  it("loads only requested packs that are not already recorded for the current version", async () => {
    window.localStorage.setItem(
      "esat-practice:question-data-state",
      JSON.stringify({ version: "dataset-v2", loaded_pack_ids: ["pack-a"] }),
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(manifest))
      .mockResolvedValueOnce(jsonResponse({ questions: [{ id: "q2", text: "Second?" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { ensureQuestionPacksBootstrapped } = await import("./loader");

    await ensureQuestionPacksBootstrapped(["pack-a", "pack-b", "unknown-pack"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/data/packs/b.json", { cache: "no-cache" });
    expect(JSON.parse(window.localStorage.getItem("esat-practice:question-data-state") ?? "null"))
      .toEqual({ version: "dataset-v2", loaded_pack_ids: ["pack-a", "pack-b"] });
  });

  it("reuses an in-flight bundled bootstrap promise and retries after failure", async () => {
    const onePackManifest = { ...manifest, packs: [manifest.packs[0]] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(onePackManifest))
      .mockRejectedValueOnce(new Error("pack unavailable"))
      .mockResolvedValueOnce(jsonResponse({ questions: [{ id: "q1", text: "Recovered?" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { ensureBundledQuestionsBootstrapped } = await import("./loader");

    const first = ensureBundledQuestionsBootstrapped();
    const concurrent = ensureBundledQuestionsBootstrapped();
    expect(concurrent).toBe(first);
    await expect(first).rejects.toThrow("pack unavailable");

    const retry = ensureBundledQuestionsBootstrapped();
    expect(retry).not.toBe(first);
    await expect(retry).resolves.toMatchObject({ inserted: 1, skipped: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
