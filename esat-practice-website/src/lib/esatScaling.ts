export type EsatModule = "maths1" | "maths2" | "physics";

export interface ScoreBand {
  label: string;
  color: "red" | "amber" | "amber-hi" | "green" | "teal" | "strong";
  min: number;
  max: number;
}

export interface Benchmark {
  label: string;
  value: number;
  isHighConfidence: boolean;
}

export interface ModuleResult {
  module: EsatModule;
  correct: number;
  total: number;
  extrapolatedRaw: number;
  scaled: number;
  scaledLow: number;
  scaledHigh: number;
  band: ScoreBand;
  isLowSample: boolean;
}

export interface ModuleGroup {
  correct: number;
  total: number;
}

const MODULE_CEILINGS: Record<EsatModule, number> = {
  maths1: 23,
  maths2: 20,
  physics: 24,
};

export const SCORE_BANDS: ScoreBand[] = [
  { label: "Below Average",        color: "red",      min: 1.0, max: 4.5 },
  { label: "Average",              color: "amber",    min: 4.5, max: 5.5 },
  { label: "Above Average",        color: "amber-hi", min: 5.5, max: 6.5 },
  { label: "Competitive",          color: "green",    min: 6.5, max: 7.0 },
  { label: "Top ~10%",             color: "teal",     min: 7.0, max: 7.5 },
  { label: "Strongly Competitive", color: "strong",   min: 7.5, max: 8.5 },
  { label: "Exceptional",          color: "strong",   min: 8.5, max: 9.0 },
];

// Values and confidence flags sourced directly from reference_score.md
export const BENCHMARKS: Benchmark[] = [
  { label: "Average applicant",          value: 4.5,  isHighConfidence: true  }, // UAT-UK official
  { label: "Above average",              value: 5.5,  isHighConfidence: true  }, // UAT-UK distribution
  { label: "Cambridge offer holder avg", value: 6.35, isHighConfidence: true  }, // Cambridge FOI Nov 2025
  { label: "Competitive / interview",    value: 6.5,  isHighConfidence: false }, // tutoring sites / TSR
  { label: "Top ~10%",                   value: 7.0,  isHighConfidence: true  }, // UAT-UK official
  { label: "Strongly competitive",       value: 7.5,  isHighConfidence: false }, // inferred
  { label: "Top ~3–5%",                  value: 8.0,  isHighConfidence: false }, // prep provider estimates
];

export function convertRawToScaled(raw: number, module: EsatModule): number {
  const ceiling = MODULE_CEILINGS[module];
  if (raw <= 4) return 1.0;
  if (raw >= ceiling) return 9.0;
  return 1.5 + ((raw - 5) / (ceiling - 5)) * 7.5;
}

export function extrapolateRaw(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 27);
}

export function getScoreBand(scaled: number): ScoreBand {
  for (const band of SCORE_BANDS) {
    if (scaled >= band.min && (band.max === 9.0 ? scaled <= band.max : scaled < band.max)) {
      return band;
    }
  }
  return SCORE_BANDS[0];
}

export function wilsonInterval(correct: number, total: number): [number, number] {
  if (total === 0) return [0, 1];
  const z = 1.28;
  const p = correct / total;
  const z2 = z * z;
  const n = total;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const margin = (z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

export function computeModuleResult(
  correct: number,
  total: number,
  module: EsatModule,
): ModuleResult {
  const [pLow, pHigh] = wilsonInterval(correct, total);
  const ceiling = MODULE_CEILINGS[module];

  const rawMid  = extrapolateRaw(correct, total);
  const rawLow  = Math.round(pLow  * 27);
  const rawHigh = Math.round(pHigh * 27);

  const scaled     = convertRawToScaled(rawMid,  module);
  const scaledLow  = convertRawToScaled(Math.min(rawLow, ceiling),  module);
  const scaledHigh = convertRawToScaled(Math.min(rawHigh, ceiling), module);

  return {
    module,
    correct,
    total,
    extrapolatedRaw: rawMid,
    scaled,
    scaledLow,
    scaledHigh,
    band: getScoreBand(scaled),
    isLowSample: total < 10,
  };
}

export function moduleForTopic(topic: string | null | undefined): "m1" | "m2" | "physics" | "unclassified" {
  if (!topic) return "unclassified";
  if (topic.startsWith("MM")) return "m2";
  if (topic.startsWith("M"))  return "m1";
  if (topic.startsWith("P"))  return "physics";
  return "unclassified";
}

export interface GroupableItem {
  question: { taxonomy: { primary_topic: string } };
}

export function groupByModule(items: GroupableItem[]): {
  m1: ModuleGroup;
  m2: ModuleGroup;
  physics: ModuleGroup;
  unclassified: ModuleGroup;
} {
  const result = {
    m1:           { correct: 0, total: 0 },
    m2:           { correct: 0, total: 0 },
    physics:      { correct: 0, total: 0 },
    unclassified: { correct: 0, total: 0 },
  };
  for (const item of items) {
    const mod = moduleForTopic(item.question.taxonomy.primary_topic);
    result[mod].total++;
  }
  return result;
}

interface ScoredItem extends GroupableItem {
  attempt: { result: "correct" | "incorrect" | "skipped" };
}

export function detectModuleGroups(items: ScoredItem[]): {
  m1: ModuleGroup;
  m2: ModuleGroup;
  physics: ModuleGroup;
} {
  const groups = { m1: { correct: 0, total: 0 }, m2: { correct: 0, total: 0 }, physics: { correct: 0, total: 0 } };
  for (const item of items) {
    const mod = moduleForTopic(item.question.taxonomy.primary_topic);
    if (mod === "unclassified") continue;
    groups[mod].total++;
    if (item.attempt.result === "correct") groups[mod].correct++;
  }
  return groups;
}

export function gapToNextBenchmark(scaled: number): { benchmark: Benchmark; gap: number } | null {
  const above = BENCHMARKS.filter((b) => b.value > scaled).sort((a, b) => a.value - b.value);
  if (above.length === 0) return null;
  const next = above[0];
  return { benchmark: next, gap: Math.round((next.value - scaled) * 100) / 100 };
}
