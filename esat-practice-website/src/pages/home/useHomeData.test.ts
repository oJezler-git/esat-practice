import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeData } from "./useHomeData";
import { getRandomQuote, getTimeBasedGreeting } from "../../lib/motivationalContent";
import { makeSession } from "../../test-utils/factories";
import type { TopicStat } from "../../types/schema";

const mocks = vi.hoisted(() => ({
  getRecentSessions: vi.fn(),
  getAllStats: vi.fn(),
}));

vi.mock("../../lib/sessionStore", () => ({
  useSessionStore: () => ({ getRecentSessions: mocks.getRecentSessions }),
}));

vi.mock("../../lib/statsStore", () => ({
  useStatsStore: () => ({ getAllStats: mocks.getAllStats }),
}));

vi.mock("../../lib/motivationalContent", () => ({
  getTimeBasedGreeting: vi.fn(() => "Good evening"),
  getRandomQuote: vi.fn(() => "Per aspera ad astra"),
}));

function makeStat(topic: string, ewma: number, attempts: number): TopicStat {
  return {
    topic,
    attempts,
    correct: Math.round(attempts * ewma),
    accuracy: ewma,
    ewma_accuracy: ewma,
    last_attempted: Date.now(),
  };
}

describe("useHomeData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getRecentSessions.mockResolvedValue([]);
    mocks.getAllStats.mockResolvedValue([]);
  });

  it("surfaces recent sessions and only genuinely weak, well-sampled topics", async () => {
    const sessions = [makeSession({ id: "s1" }), makeSession({ id: "s2" })];
    mocks.getRecentSessions.mockResolvedValue(sessions);
    mocks.getAllStats.mockResolvedValue([
      makeStat("Weak & sampled", 0.3, 5), // kept
      makeStat("Weak but thin", 0.2, 2), // dropped: under 3 attempts
      makeStat("Strong", 0.9, 10), // dropped: not weak
      makeStat("Also weak 1", 0.4, 4), // kept
      makeStat("Also weak 2", 0.45, 4), // kept
      makeStat("Also weak 3", 0.1, 9), // dropped: top-3 cap
    ]);

    const { result } = renderHook(() => useHomeData());

    await waitFor(() => {
      expect(result.current.recentSessions).toHaveLength(2);
    });
    expect(mocks.getRecentSessions).toHaveBeenCalledWith(3);
    expect(result.current.weakTopics.map((stat) => stat.topic)).toEqual([
      "Weak & sampled",
      "Also weak 1",
      "Also weak 2",
    ]);
  });

  it("generates and caches the greeting/quote for the current hour", async () => {
    const { result } = renderHook(() => useHomeData());

    await waitFor(() => {
      expect(result.current.greeting).toBe("Good evening");
    });
    expect(result.current.quote).toBe("Per aspera ad astra");

    const cached = JSON.parse(localStorage.getItem("greeting_cache")!);
    expect(cached).toEqual({
      greeting: "Good evening",
      quote: "Per aspera ad astra",
      hourGenerated: new Date().getHours(),
    });
  });

  it("reuses the cached greeting within the same hour instead of regenerating", async () => {
    localStorage.setItem(
      "greeting_cache",
      JSON.stringify({
        greeting: "Cached hello",
        quote: "Cached quote",
        hourGenerated: new Date().getHours(),
      }),
    );

    const { result } = renderHook(() => useHomeData());

    await waitFor(() => {
      expect(result.current.greeting).toBe("Cached hello");
    });
    expect(result.current.quote).toBe("Cached quote");
    expect(getTimeBasedGreeting).not.toHaveBeenCalled();
    expect(getRandomQuote).not.toHaveBeenCalled();
  });

  it("regenerates when the cached greeting is from a different hour", async () => {
    localStorage.setItem(
      "greeting_cache",
      JSON.stringify({
        greeting: "Stale hello",
        quote: "Stale quote",
        hourGenerated: (new Date().getHours() + 1) % 24,
      }),
    );

    const { result } = renderHook(() => useHomeData());

    await waitFor(() => {
      expect(result.current.greeting).toBe("Good evening");
    });
    expect(getTimeBasedGreeting).toHaveBeenCalledTimes(1);
    const cached = JSON.parse(localStorage.getItem("greeting_cache")!);
    expect(cached.hourGenerated).toBe(new Date().getHours());
  });
});
