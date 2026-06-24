import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateConfirmationPhrase, clearAllData, clearProgressData } from "./dataManagement";

const NATO_WORDS = [
  "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
  "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
  "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey",
  "xray", "yankee", "zulu",
];

describe("generateConfirmationPhrase", () => {
  it("returns a string with exactly 3 words", () => {
    const phrase = generateConfirmationPhrase();
    expect(phrase.split(" ")).toHaveLength(3);
  });

  it("each word is a valid NATO alphabet word", () => {
    for (let i = 0; i < 20; i++) {
      const phrase = generateConfirmationPhrase();
      for (const word of phrase.split(" ")) {
        expect(NATO_WORDS).toContain(word);
      }
    }
  });

  it("produces different phrases across calls (statistical)", () => {
    const phrases = new Set(Array.from({ length: 50 }, generateConfirmationPhrase));
    expect(phrases.size).toBeGreaterThan(1);
  });
});

describe("clearAllData", () => {
  beforeEach(() => {
    localStorage.setItem("some-key", "value");
    sessionStorage.setItem("other-key", "value");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears localStorage", async () => {
    vi.stubGlobal("indexedDB", { databases: vi.fn().mockResolvedValue([]) });

    await clearAllData();

    expect(localStorage.length).toBe(0);
  });

  it("clears sessionStorage", async () => {
    vi.stubGlobal("indexedDB", { databases: vi.fn().mockResolvedValue([]) });

    await clearAllData();

    expect(sessionStorage.length).toBe(0);
  });

  it("calls deleteDatabase for each listed db", async () => {
    const deleteDatabase = vi.fn();
    vi.stubGlobal("indexedDB", {
      databases: vi.fn().mockResolvedValue([{ name: "esat-practice-db" }, { name: "other-db" }]),
      deleteDatabase,
    });

    await clearAllData();

    expect(deleteDatabase).toHaveBeenCalledWith("esat-practice-db");
    expect(deleteDatabase).toHaveBeenCalledWith("other-db");
  });
});

describe("clearProgressData", () => {
  const PROGRESS_KEYS = [
    "esat-practice:question-data-state",
    "esat-practice:sessions",
    "esat-practice:stats",
    "persistent_storage",
  ];

  beforeEach(() => {
    for (const key of PROGRESS_KEYS) localStorage.setItem(key, "data");
    localStorage.setItem("esat-settings", "keep-me");
    sessionStorage.setItem("session-key", "value");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes only the progress-related localStorage keys", async () => {
    vi.stubGlobal("indexedDB", { databases: vi.fn().mockResolvedValue([]) });

    await clearProgressData();

    for (const key of PROGRESS_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  it("preserves unrelated localStorage keys like settings", async () => {
    vi.stubGlobal("indexedDB", { databases: vi.fn().mockResolvedValue([]) });

    await clearProgressData();

    expect(localStorage.getItem("esat-settings")).toBe("keep-me");
  });

  it("clears sessionStorage", async () => {
    vi.stubGlobal("indexedDB", { databases: vi.fn().mockResolvedValue([]) });

    await clearProgressData();

    expect(sessionStorage.length).toBe(0);
  });

  it("calls deleteDatabase for each listed db", async () => {
    const deleteDatabase = vi.fn();
    vi.stubGlobal("indexedDB", {
      databases: vi.fn().mockResolvedValue([{ name: "esat-practice-db" }]),
      deleteDatabase,
    });

    await clearProgressData();

    expect(deleteDatabase).toHaveBeenCalledWith("esat-practice-db");
  });
});
