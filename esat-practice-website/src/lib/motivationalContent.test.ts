import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getRandomQuote,
  getTimeBasedGreeting,
  MOTIVATIONAL_QUOTES,
  GREETINGS_BY_TIME,
} from "./motivationalContent";

afterEach(() => {
  vi.useRealTimers();
});

describe("getRandomQuote", () => {
  it("returns a string that belongs to MOTIVATIONAL_QUOTES", () => {
    for (let i = 0; i < 20; i++) {
      expect(MOTIVATIONAL_QUOTES).toContain(getRandomQuote());
    }
  });

  it("produces different quotes across calls (statistical check)", () => {
    const results = new Set(Array.from({ length: 50 }, getRandomQuote));
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("getTimeBasedGreeting — time category selection", () => {
  function setHour(hour: number) {
    const date = new Date("2024-01-15T00:00:00.000Z");
    date.setHours(hour, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(date);
  }

  it("picks from lateNight for hours 0–4", () => {
    for (const hour of [0, 1, 3, 4]) {
      setHour(hour);
      expect(GREETINGS_BY_TIME.lateNight).toContain(getTimeBasedGreeting());
    }
  });

  it("picks from earlyMorning for hours 5–6", () => {
    for (const hour of [5, 6]) {
      setHour(hour);
      expect(GREETINGS_BY_TIME.earlyMorning).toContain(getTimeBasedGreeting());
    }
  });

  it("picks from morning for hours 7–11", () => {
    for (const hour of [7, 9, 11]) {
      setHour(hour);
      expect(GREETINGS_BY_TIME.morning).toContain(getTimeBasedGreeting());
    }
  });

  it("picks from midday for hour 12", () => {
    setHour(12);
    expect(GREETINGS_BY_TIME.midday).toContain(getTimeBasedGreeting());
  });

  it("picks from afternoon for hours 13–16", () => {
    for (const hour of [13, 15, 16]) {
      setHour(hour);
      expect(GREETINGS_BY_TIME.afternoon).toContain(getTimeBasedGreeting());
    }
  });

  it("picks from lateAfternoon for hours 17–18", () => {
    for (const hour of [17, 18]) {
      setHour(hour);
      expect(GREETINGS_BY_TIME.lateAfternoon).toContain(getTimeBasedGreeting());
    }
  });

  it("picks from evening for hours 19–20", () => {
    for (const hour of [19, 20]) {
      setHour(hour);
      expect(GREETINGS_BY_TIME.evening).toContain(getTimeBasedGreeting());
    }
  });

  it("picks from night for hours 21–23", () => {
    for (const hour of [21, 22, 23]) {
      setHour(hour);
      expect(GREETINGS_BY_TIME.night).toContain(getTimeBasedGreeting());
    }
  });

  it("returns different greetings across calls within the same category (statistical check)", () => {
    setHour(10); // morning
    const results = new Set(Array.from({ length: 30 }, getTimeBasedGreeting));
    expect(results.size).toBeGreaterThan(1);
  });
});
