import { describe, expect, it } from "vitest";
import {
  BENCHMARKS,
  SCORE_BANDS,
  computeModuleResult,
  convertRawToScaled,
  detectModuleGroups,
  extrapolateRaw,
  gapToNextBenchmark,
  getScoreBand,
  moduleForTopic,
  wilsonInterval,
} from "./esatScaling";

// --- convertRawToScaled ---

describe("convertRawToScaled", () => {
  it("raw 0 → 1.0", () => expect(convertRawToScaled(0, "maths1")).toBe(1.0));
  it("raw 4 → 1.0", () => expect(convertRawToScaled(4, "maths1")).toBe(1.0));
  it("raw 23 (ceiling for maths1) → 9.0", () => expect(convertRawToScaled(23, "maths1")).toBe(9.0));
  it("raw 20 (ceiling for maths2) → 9.0", () => expect(convertRawToScaled(20, "maths2")).toBe(9.0));
  it("raw 24 (ceiling for physics) → 9.0", () => expect(convertRawToScaled(24, "physics")).toBe(9.0));
  it("raw above ceiling → 9.0", () => expect(convertRawToScaled(30, "maths1")).toBe(9.0));

  it("raw 5 → 1.5 (formula anchor)", () => {
    const result = convertRawToScaled(5, "maths1");
    expect(result).toBeCloseTo(1.5, 5);
  });

  it("mid-range interpolates smoothly (maths1, raw=14)", () => {
    const result = convertRawToScaled(14, "maths1");
    expect(result).toBeGreaterThan(1.5);
    expect(result).toBeLessThan(9.0);
  });
});

// --- extrapolateRaw ---

describe("extrapolateRaw", () => {
  it("total 0 → 0", () => expect(extrapolateRaw(0, 0)).toBe(0));
  it("all correct → 27", () => expect(extrapolateRaw(10, 10)).toBe(27));
  it("half correct → ~14", () => expect(extrapolateRaw(5, 10)).toBe(14));
  it("rounds to nearest integer", () => {
    expect(Number.isInteger(extrapolateRaw(7, 10))).toBe(true);
  });
});

// --- getScoreBand ---

describe("getScoreBand", () => {
  it("1.0 → Below Average", () => expect(getScoreBand(1.0).label).toBe("Below Average"));
  it("4.4 → Below Average", () => expect(getScoreBand(4.4).label).toBe("Below Average"));
  it("4.5 → Average", () => expect(getScoreBand(4.5).label).toBe("Average"));
  it("5.4 → Average", () => expect(getScoreBand(5.4).label).toBe("Average"));
  it("5.5 → Above Average", () => expect(getScoreBand(5.5).label).toBe("Above Average"));
  it("6.4 → Above Average", () => expect(getScoreBand(6.4).label).toBe("Above Average"));
  it("6.5 → Competitive", () => expect(getScoreBand(6.5).label).toBe("Competitive"));
  it("6.9 → Competitive", () => expect(getScoreBand(6.9).label).toBe("Competitive"));
  it("7.0 → Top ~10%", () => expect(getScoreBand(7.0).label).toBe("Top ~10%"));
  it("7.4 → Top ~10%", () => expect(getScoreBand(7.4).label).toBe("Top ~10%"));
  it("7.5 → Strongly Competitive", () => expect(getScoreBand(7.5).label).toBe("Strongly Competitive"));
  it("8.4 → Strongly Competitive", () => expect(getScoreBand(8.4).label).toBe("Strongly Competitive"));
  it("8.5 → Exceptional", () => expect(getScoreBand(8.5).label).toBe("Exceptional"));
  it("9.0 → Exceptional", () => expect(getScoreBand(9.0).label).toBe("Exceptional"));
});

// --- wilsonInterval ---

describe("wilsonInterval", () => {
  it("total 0 → [0, 1]", () => {
    const [lo, hi] = wilsonInterval(0, 0);
    expect(lo).toBe(0);
    expect(hi).toBe(1);
  });

  it("all correct → upper bound ≤ 1.0, lower < 1.0", () => {
    const [lo, hi] = wilsonInterval(10, 10);
    expect(hi).toBeLessThanOrEqual(1.0);
    expect(lo).toBeLessThan(1.0);
  });

  it("all wrong → lower bound ≥ 0.0, upper > 0.0", () => {
    const [lo, hi] = wilsonInterval(0, 10);
    expect(lo).toBeGreaterThanOrEqual(0.0);
    expect(hi).toBeGreaterThan(0.0);
  });

  it("50% correct gives interval straddling 0.5", () => {
    const [lo, hi] = wilsonInterval(5, 10);
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBeGreaterThan(0.5);
  });

  it("larger sample → narrower interval", () => {
    const [lo10, hi10] = wilsonInterval(5, 10);
    const [lo100, hi100] = wilsonInterval(50, 100);
    expect(hi10 - lo10).toBeGreaterThan(hi100 - lo100);
  });

  it("bounds are in [0, 1]", () => {
    const [lo, hi] = wilsonInterval(3, 7);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
  });
});

// --- computeModuleResult ---

describe("computeModuleResult", () => {
  it("returns a result with correct module", () => {
    const r = computeModuleResult(5, 10, "maths1");
    expect(r.module).toBe("maths1");
  });

  it("scaledLow ≤ scaled ≤ scaledHigh", () => {
    const r = computeModuleResult(5, 10, "maths1");
    expect(r.scaledLow).toBeLessThanOrEqual(r.scaled);
    expect(r.scaled).toBeLessThanOrEqual(r.scaledHigh);
  });

  it("all correct → scaled near 9.0", () => {
    const r = computeModuleResult(20, 20, "maths1");
    expect(r.scaled).toBeGreaterThan(7.0);
  });

  it("all wrong → scaled near 1.0", () => {
    const r = computeModuleResult(0, 20, "maths1");
    expect(r.scaled).toBeLessThanOrEqual(2.0);
  });

  it("isLowSample true when total < 10", () => {
    expect(computeModuleResult(3, 5, "physics").isLowSample).toBe(true);
  });

  it("isLowSample false when total ≥ 10", () => {
    expect(computeModuleResult(5, 10, "physics").isLowSample).toBe(false);
  });

  it("total 0 → scaled at minimum", () => {
    const r = computeModuleResult(0, 0, "maths2");
    expect(r.scaled).toBe(1.0);
  });
});

// --- moduleForTopic ---

describe("moduleForTopic", () => {
  it("MM prefix → m2", () => expect(moduleForTopic("MM01")).toBe("m2"));
  it("MM prefix (longer) → m2 not m1", () => expect(moduleForTopic("MMAlgebra")).toBe("m2"));
  it("M prefix (non-MM) → m1", () => expect(moduleForTopic("M01")).toBe("m1"));
  it("M prefix → m1", () => expect(moduleForTopic("MCalculus")).toBe("m1"));
  it("P prefix → physics", () => expect(moduleForTopic("PForces")).toBe("physics"));
  it("unknown prefix → unclassified", () => expect(moduleForTopic("XUnknown")).toBe("unclassified"));
  it("null → unclassified", () => expect(moduleForTopic(null)).toBe("unclassified"));
  it("undefined → unclassified", () => expect(moduleForTopic(undefined)).toBe("unclassified"));
  it("empty string → unclassified", () => expect(moduleForTopic("")).toBe("unclassified"));
});

// --- detectModuleGroups ---

describe("detectModuleGroups", () => {
  function makeItem(topic: string, result: "correct" | "incorrect" | "skipped") {
    return { question: { taxonomy: { primary_topic: topic } }, attempt: { result } };
  }

  it("correctly groups M1, M2, and physics", () => {
    const items = [
      makeItem("MAlgebra", "correct"),
      makeItem("MAlgebra", "incorrect"),
      makeItem("MMStats", "correct"),
      makeItem("PForces", "correct"),
      makeItem("PForces", "skipped"),
    ];
    const g = detectModuleGroups(items);
    expect(g.m1.total).toBe(2);
    expect(g.m1.correct).toBe(1);
    expect(g.m2.total).toBe(1);
    expect(g.m2.correct).toBe(1);
    expect(g.physics.total).toBe(2);
    expect(g.physics.correct).toBe(1);
  });

  it("MM is not counted as m1", () => {
    const items = [makeItem("MMMatrix", "correct"), makeItem("MMMatrix", "incorrect")];
    const g = detectModuleGroups(items);
    expect(g.m2.total).toBe(2);
    expect(g.m1.total).toBe(0);
  });

  it("mixed session with all three modules", () => {
    const items = [
      makeItem("MGeometry", "correct"),
      makeItem("MMProbability", "incorrect"),
      makeItem("PThermodynamics", "correct"),
    ];
    const g = detectModuleGroups(items);
    expect(g.m1.total).toBe(1);
    expect(g.m2.total).toBe(1);
    expect(g.physics.total).toBe(1);
  });

  it("unclassified topics are ignored", () => {
    const items = [makeItem("XUnknown", "correct")];
    const g = detectModuleGroups(items);
    expect(g.m1.total).toBe(0);
    expect(g.m2.total).toBe(0);
    expect(g.physics.total).toBe(0);
  });
});

// --- gapToNextBenchmark ---

describe("gapToNextBenchmark", () => {
  it("scaled 4.0 → nearest benchmark above", () => {
    const r = gapToNextBenchmark(4.0);
    expect(r).not.toBeNull();
    expect(r!.benchmark.value).toBe(4.5);
    expect(r!.gap).toBeCloseTo(0.5, 5);
  });

  it("scaled 8.0 → null (at or above top benchmark)", () => {
    expect(gapToNextBenchmark(8.0)).toBeNull();
  });

  it("scaled 8.1 → null", () => {
    expect(gapToNextBenchmark(8.1)).toBeNull();
  });

  it("scaled 7.3 → next benchmark at 7.5", () => {
    const r = gapToNextBenchmark(7.3);
    expect(r!.benchmark.value).toBe(7.5);
  });

  it("scaled 6.2 → next benchmark is Cambridge offer holder avg at 6.35", () => {
    const r = gapToNextBenchmark(6.2);
    expect(r!.benchmark.label).toBe("Cambridge offer holder avg");
    expect(r!.benchmark.value).toBe(6.35);
    expect(r!.gap).toBeCloseTo(0.15, 2);
  });

  it("Cambridge offer holder avg has isHighConfidence true", () => {
    const b = BENCHMARKS.find((bm) => bm.label === "Cambridge offer holder avg");
    expect(b).toBeDefined();
    expect(b!.isHighConfidence).toBe(true);
  });
});

// --- SCORE_BANDS sanity ---

describe("SCORE_BANDS", () => {
  it("has 7 bands", () => expect(SCORE_BANDS).toHaveLength(7));
  it("first band starts at 1.0", () => expect(SCORE_BANDS[0].min).toBe(1.0));
  it("last band ends at 9.0", () => expect(SCORE_BANDS[SCORE_BANDS.length - 1].max).toBe(9.0));
  it("bands are contiguous (max[i] == min[i+1])", () => {
    for (let i = 0; i < SCORE_BANDS.length - 1; i++) {
      expect(SCORE_BANDS[i].max).toBe(SCORE_BANDS[i + 1].min);
    }
  });
});

// --- BENCHMARKS sanity ---

describe("BENCHMARKS", () => {
  it("has 7 entries", () => expect(BENCHMARKS).toHaveLength(7));
  it("all values in [1, 9]", () => {
    for (const b of BENCHMARKS) {
      expect(b.value).toBeGreaterThanOrEqual(1);
      expect(b.value).toBeLessThanOrEqual(9);
    }
  });
  it("lowest benchmark is 4.5", () => {
    const min = Math.min(...BENCHMARKS.map((b) => b.value));
    expect(min).toBe(4.5);
  });
  it("highest benchmark is 8.0", () => {
    const max = Math.max(...BENCHMARKS.map((b) => b.value));
    expect(max).toBe(8.0);
  });
});
