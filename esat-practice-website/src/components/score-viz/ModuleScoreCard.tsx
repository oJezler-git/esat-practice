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

      <div className="sv-headline-row">
        <span className="sv-band-headline">{bandHeadline}</span>
        <span className="sv-score-range">
          {result.scaledLow.toFixed(1)}–{result.scaledHigh.toFixed(1)}
        </span>
      </div>

      <ScaleTrack scaledLow={result.scaledLow} scaledHigh={result.scaledHigh} />

      <div className="sv-meta-row">
        <span className="sv-raw-line">~{result.extrapolatedRaw}/27 raw</span>
        {gap && (
          <span className="sv-gap-line">
            +{gap.gap.toFixed(1)} to <em>{gap.benchmark.label}</em>
          </span>
        )}
      </div>

      {result.isLowSample && (
        <div className="sv-low-sample">
          Low sample ({result.total} q) — wide uncertainty
        </div>
      )}

      <div className="sv-disclaimer">
        80% CI estimate. Practice accuracy ≠ real exam raw score.
      </div>
    </div>
  );
}
