import { BENCHMARKS, SCORE_BANDS } from "../../lib/esatScaling";

interface ScaleTrackProps {
  scaledLow: number;
  scaledHigh: number;
}

function toX(scaled: number): number {
  return ((scaled - 1) / 8) * 100;
}

export function ScaleTrack({ scaledLow, scaledHigh }: ScaleTrackProps) {
  const xLow  = toX(Math.max(1, Math.min(9, scaledLow)));
  const xHigh = toX(Math.max(1, Math.min(9, scaledHigh)));

  return (
    <div className="sv-track">
      <svg
        viewBox="0 0 100 28"
        className="sv-chart"
        aria-hidden="true"
        style={{ height: "2rem" }}
      >
        {/* Band zones */}
        {SCORE_BANDS.map((band) => (
          <rect
            key={band.label}
            x={toX(band.min)}
            y={10}
            width={toX(band.max) - toX(band.min)}
            height={8}
            fill={`var(--sv-band-${band.color})`}
            opacity={0.18}
          />
        ))}

        {/* Range bar */}
        <rect
          x={xLow}
          y={11}
          width={Math.max(1, xHigh - xLow)}
          height={6}
          rx={2}
          fill={`var(--sv-band-${SCORE_BANDS.find(b => {
            const mid = (scaledLow + scaledHigh) / 2;
            return mid >= b.min && (b.max === 9 ? mid <= b.max : mid < b.max);
          })?.color ?? "green"})`}
          opacity={0.85}
        />

        {/* Benchmark ticks */}
        {BENCHMARKS.map((bm) => {
          const x = toX(bm.value);
          return bm.isHighConfidence ? (
            <line
              key={bm.label}
              x1={x}
              y1={8}
              x2={x}
              y2={22}
              stroke="var(--text-muted)"
              strokeWidth={0.6}
              opacity={0.6}
            />
          ) : (
            <line
              key={bm.label}
              x1={x}
              y1={8}
              x2={x}
              y2={22}
              stroke="var(--text-muted)"
              strokeWidth={0.6}
              strokeDasharray="1.5 1.5"
              opacity={0.35}
            />
          );
        })}

        {/* Scale labels */}
        {[1, 3, 5, 7, 9].map((v) => (
          <text
            key={v}
            x={toX(v)}
            y={27}
            textAnchor="middle"
            fontSize={4}
            fill="var(--text-muted)"
            opacity={0.6}
          >
            {v}
          </text>
        ))}
      </svg>
    </div>
  );
}
