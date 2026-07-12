import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  DEFAULT_TOPIC,
  moduleSummary,
  recentTopics,
  useRevisionProgress,
} from "./revisionProgress";
import type { RevisionDocEntry } from "../content/revision/types";

function docEntry(id: string): RevisionDocEntry {
  const [module, slug] = id.split("/");
  return {
    id,
    path: `./topics/${id}.mdx`,
    meta: {
      slug,
      module: module as RevisionDocEntry["meta"]["module"],
      title: slug,
      subtitle: "",
      topicCode: slug.toUpperCase(),
      estimatedMinutes: 5,
      order: 0,
    },
  };
}

const store = () => useRevisionProgress.getState();

beforeEach(() => {
  localStorage.clear();
  useRevisionProgress.getState().reset();
});

describe("recordVisit", () => {
  it("sets firstVisited once and updates lastVisited on repeat visits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    store().recordVisit("m1/units");
    const first = store().topics["m1/units"];
    expect(first.firstVisited).toBe(1000);
    expect(first.lastVisited).toBe(1000);

    vi.setSystemTime(5000);
    store().recordVisit("m1/units");
    const second = store().topics["m1/units"];
    expect(second.firstVisited).toBe(1000);
    expect(second.lastVisited).toBe(5000);
    vi.useRealTimers();
  });
});

describe("recordScroll", () => {
  it("keeps the running max — a later smaller pct does not lower it", () => {
    store().recordScroll("m1/units", 60);
    expect(store().topics["m1/units"].scrollPct).toBe(60);
    store().recordScroll("m1/units", 30);
    expect(store().topics["m1/units"].scrollPct).toBe(60);
  });

  it("clamps out-of-range input to 0–100", () => {
    store().recordScroll("m1/units", 250);
    expect(store().topics["m1/units"].scrollPct).toBe(100);
    // A negative reading never lowers the stored max (or drops below 0).
    store().recordScroll("m1/units", -40);
    expect(store().topics["m1/units"].scrollPct).toBe(100);
  });

  it("flips read true at >=90% and leaves done untouched", () => {
    store().recordScroll("m1/units", 89);
    expect(store().topics["m1/units"].read).toBe(false);
    store().recordScroll("m1/units", 92);
    expect(store().topics["m1/units"].read).toBe(true);
    expect(store().topics["m1/units"].done).toBe(false);
  });
});

describe("markDone", () => {
  it("toggles done independently of read/scrollPct", () => {
    store().recordScroll("m1/units", 20);
    store().markDone("m1/units", true);
    expect(store().topics["m1/units"].done).toBe(true);
    expect(store().topics["m1/units"].scrollPct).toBe(20);
    store().markDone("m1/units", false);
    expect(store().topics["m1/units"].done).toBe(false);
  });
});

describe("setConfidence", () => {
  it("sets and clears a rating", () => {
    store().setConfidence("m1/units", "solid");
    expect(store().topics["m1/units"].confidence).toBe("solid");
    store().setConfidence("m1/units", null);
    expect(store().topics["m1/units"].confidence).toBeNull();
  });
});

describe("upsert of unknown docId", () => {
  it("creates a full DEFAULT_TOPIC-shaped record", () => {
    store().markDone("physics/waves", true);
    const record = store().topics["physics/waves"];
    expect(Object.keys(record).sort()).toEqual(Object.keys(DEFAULT_TOPIC).sort());
    expect(record.done).toBe(true);
    expect(record.confidence).toBeNull();
    expect(record.scrollPct).toBe(0);
  });
});

describe("moduleSummary", () => {
  it("counts done/total and computes pct", () => {
    store().markDone("m1/units", true);
    store().recordScroll("m1/number", 95); // read but not done
    const docs = [docEntry("m1/units"), docEntry("m1/number"), docEntry("m1/ratio")];
    const summary = moduleSummary(store().topics, docs);
    expect(summary.total).toBe(3);
    expect(summary.done).toBe(1);
    expect(summary.read).toBe(1);
    expect(summary.pct).toBeCloseTo((1 / 3) * 100);
  });

  it("returns pct 0 for an empty module", () => {
    expect(moduleSummary(store().topics, [])).toEqual({
      total: 0,
      done: 0,
      read: 0,
      pct: 0,
    });
  });
});

describe("recentTopics", () => {
  const docs = [
    docEntry("m1/units"),
    docEntry("m1/number"),
    docEntry("m2/algebra"),
  ];

  it("returns most-recent-first and respects the limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    store().recordVisit("m1/units");
    vi.setSystemTime(2000);
    store().recordVisit("m2/algebra");
    vi.setSystemTime(3000);
    store().recordVisit("m1/number");
    vi.useRealTimers();

    const recents = recentTopics(store().topics, docs, 2);
    expect(recents.map((d) => d.id)).toEqual(["m1/number", "m2/algebra"]);
  });

  it("ignores never-visited topics and returns [] with no history", () => {
    expect(recentTopics(store().topics, docs)).toEqual([]);
    store().markDone("m1/units", true); // marked done but never visited
    expect(recentTopics(store().topics, docs)).toEqual([]);
  });
});

describe("persistence", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("writes state under the esat-revision-progress key", () => {
    store().markDone("m1/units", true);
    const raw = localStorage.getItem("esat-revision-progress");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.topics["m1/units"].done).toBe(true);
  });
});
