import { BENCHMARKS, SCORE_BANDS } from "../../lib/esatScaling";

interface ScaleTrackProps {
  scaledLow: number;
  scaledHigh: number;
}

// Map a 1–9 score to 0–100 x-coordinate
function toX(scaled: number): number {
  return ((Math.max(1, Math.min(9, scaled)) - 1) / 8) * 100;
}

// Which benchmarks to label directly on the track (most informative subset)
const LABELED: Set<string> = new Set([
  "Average applicant",
  "Cambridge offer holder avg",
  "Top ~10%",
]);

// Stagger labeled benchmarks above/below to reduce crowding
const LABEL_ROW: Record<string, "above" | "below"> = {
  "Average applicant":         "below",
  "Cambridge offer holder avg":"above",
  "Top ~10%":                  "below",
};

const SHORT_LABEL: Record<string, string> = {
  "Average applicant":          "Avg",
  "Cambridge offer holder avg": "Offer holders",
  "Top ~10%":                   "Top 10%",
};

// viewBox coordinate constants
const VB_W = 100;
const VB_H = 52;
const TRACK_Y = 18;   // top edge of band zone
const TRACK_H = 14;   // height of band zone
const BAR_Y   = TRACK_Y + 1;
const BAR_H   = TRACK_H - 2;
const TICK_TOP    = TRACK_Y - 2;
const TICK_BOTTOM = TRACK_Y + TRACK_H + 2;
const LABEL_ABOVE_Y = TRACK_Y - 5;
const LABEL_BELOW_Y = TRACK_Y + TRACK_H + 9;
const SCALE_Y = VB_H - 2;

export function ScaleTrack({ scaledLow, scaledHigh }: ScaleTrackProps) {
  const xLow  = toX(scaledLow);
  const xHigh = toX(scaledHigh);

  const midBandColor = SCORE_BANDS.find((b) => {
    const mid = (scaledLow + scaledHigh) / 2;
    return mid >= b.min && (b.max === 9.0 ? mid <= b.max : mid < b.max);
  })?.color ?? "green";

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="sv-chart sv-scale-track"
      aria-hidden="true"
    >
      {/* Band zone backgrounds */}
      {SCORE_BANDS.map((band) => (
        <rect
          key={band.label}
          x={toX(band.min)}
          y={TRACK_Y}
          width={toX(band.max) - toX(band.min)}
          height={TRACK_H}
          fill={`var(--sv-band-${band.color})`}
          opacity={0.15}
        />
      ))}

      {/* Track outline */}
      <rect
        x={0}
        y={TRACK_Y}
        width={100}
        height={TRACK_H}
        rx={3}
        fill="none"
        stroke="var(--border-subtle)"
        strokeWidth={0.4}
      />

      {/* User range bar */}
      <rect
        x={xLow}
        y={BAR_Y}
        width={Math.max(1.5, xHigh - xLow)}
        height={BAR_H}
        rx={2}
        fill={`var(--sv-band-${midBandColor})`}
        opacity={0.9}
      />

      {/* Benchmark ticks + labels */}
      {BENCHMARKS.map((bm) => {
        const x = toX(bm.value);
        const labeled = LABELED.has(bm.label);
        const row = LABEL_ROW[bm.label] ?? "above";

        return (
          <g key={bm.label}>
            <line
              x1={x} y1={TICK_TOP}
              x2={x} y2={TICK_BOTTOM}
              stroke="var(--text-muted)"
              strokeWidth={bm.isHighConfidence ? 0.8 : 0.5}
              strokeDasharray={bm.isHighConfidence ? undefined : "1.8 1.4"}
              opacity={bm.isHighConfidence ? 0.7 : 0.35}
            />
            {labeled && (
              <text
                x={x}
                y={row === "above" ? LABEL_ABOVE_Y : LABEL_BELOW_Y}
                textAnchor="middle"
                fontSize={4.2}
                fill="var(--text-muted)"
                opacity={0.75}
              >
                {SHORT_LABEL[bm.label]}
              </text>
            )}
          </g>
        );
      })}

      {/* Scale numbers 1–9 */}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => (
        <text
          key={v}
          x={toX(v)}
          y={SCALE_Y}
          textAnchor="middle"
          fontSize={4}
          fill="var(--text-muted)"
          opacity={0.5}
        >
          {v}
        </text>
      ))}
    </svg>
  );
}
