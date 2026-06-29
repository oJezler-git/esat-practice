import { gapToNextBenchmark, getScoreBand } from "../../lib/esatScaling";
import type { ModuleResult } from "../../lib/esatScaling";
import { ScaleTrack } from "./ScaleTrack";

interface ModuleScoreCardProps {
  result: ModuleResult;
  label: string;
}

export function ModuleScoreCard({ result, label }: ModuleScoreCardProps) {
  const lowBand  = getScoreBand(result.scaledLow);
  const highBand = getScoreBand(result.scaledHigh);
  const bandHeadline =
    lowBand.label === highBand.label
      ? lowBand.label
      : `${lowBand.label}–${highBand.label}`;

  const gap = gapToNextBenchmark(result.scaled);

  return (
    <div className="sv-card">
      <div className="sv-card-label">{label}</div>
      <div className="sv-band-headline">{bandHeadline}</div>
      <div className="sv-score-range">
        ≈{result.scaledLow.toFixed(1)}–{result.scaledHigh.toFixed(1)} on the 1–9 scale
      </div>

      <ScaleTrack scaledLow={result.scaledLow} scaledHigh={result.scaledHigh} />

      <div className="sv-raw-line">
        Extrapolated raw: {result.extrapolatedRaw}/27
      </div>

      {gap && (
        <div className="sv-gap-line">
          +{gap.gap.toFixed(1)} to <em>{gap.benchmark.label}</em>
        </div>
      )}

      {result.isLowSample && (
        <div className="sv-low-sample">
          Low sample ({result.total} questions) — wide uncertainty
        </div>
      )}

      <div className="sv-disclaimer">
        Practice accuracy ≠ real exam raw score. This range is an
        80% confidence estimate, not a guarantee.
      </div>
    </div>
  );
}
