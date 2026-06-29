import { useState } from "react";
import { BENCHMARKS, SCORE_BANDS } from "../../lib/esatScaling";

interface ScaleTrackProps {
  scaledLow: number;
  scaledHigh: number;
}

function toX(scaled: number): number {
  return ((Math.max(1, Math.min(9, scaled)) - 1) / 8) * 100;
}

const LABELED: Set<string> = new Set([
  "Average applicant",
  "Cambridge offer holder avg",
  "Top ~10%",
]);

const LABEL_ROW: Record<string, "above" | "below"> = {
  "Average applicant":          "below",
  "Cambridge offer holder avg": "above",
  "Top ~10%":                   "below",
};

const SHORT_LABEL: Record<string, string> = {
  "Average applicant":          "Avg",
  "Cambridge offer holder avg": "Offer holders",
  "Top ~10%":                   "Top 10%",
};

interface TooltipInfo {
  title: string;
  body: string;
  badge?: { label: string; type: "official" | "inferred" };
}

// Solid line = high-confidence official source; dashed = inferred/community
const BENCHMARK_TOOLTIPS: Record<string, TooltipInfo> = {
  "Average applicant": {
    title: "Average applicant · 4.5",
    body: "Average score across all ESAT sitters. UAT-UK designed the scale so the midpoint lands here.",
    badge: { label: "UAT-UK official", type: "official" },
  },
  "Above average": {
    title: "Above average · 5.5",
    body: "Upper boundary of the average band — above the majority of applicants.",
    badge: { label: "UAT-UK official", type: "official" },
  },
  "Cambridge offer holder avg": {
    title: "Cambridge offer holder avg · 6.35",
    body: "Average per-module score for Cambridge Engineering offer holders. Source: Cambridge FOI response FOI-2025-1028 (Nov 2025).",
    badge: { label: "Cambridge FOI · high confidence", type: "official" },
  },
  "Competitive / interview": {
    title: "Competitive / interview-viable · 6.5",
    body: "Widely cited interview threshold. Not from UAT-UK directly — sourced from tutoring sites and TSR applicant reports.",
    badge: { label: "Inferred · community reports", type: "inferred" },
  },
  "Top ~10%": {
    title: "Top ~10% · 7.0",
    body: "Upper decile of all ESAT sitters, per UAT-UK official score distribution document (Oct 2024).",
    badge: { label: "UAT-UK official", type: "official" },
  },
  "Strongly competitive": {
    title: "Strongly competitive · 7.5",
    body: "Inferred from the shape of the UAT-UK distribution. Not a stated official threshold.",
    badge: { label: "Inferred · not official", type: "inferred" },
  },
  "Top ~3–5%": {
    title: "Top 3–5% · 8.0",
    body: "Estimate from multiple tutoring providers (Tutelaprep, Quest For Success). Consistent but unverified.",
    badge: { label: "Inferred · tutoring providers", type: "inferred" },
  },
};

const VB_W = 100;
const VB_H = 28;
const TRACK_Y = 7;
const TRACK_H = 10;
const BAR_Y   = TRACK_Y + 1;
const BAR_H   = TRACK_H - 2;
const TICK_TOP    = 4;
const TICK_BOTTOM = 20;
const LABEL_ABOVE_Y = 3.0;
const LABEL_BELOW_Y = 23.5;
const SCALE_Y = 27.2;

interface TooltipState {
  xPct: number;
  info: TooltipInfo;
}

export function ScaleTrack({ scaledLow, scaledHigh }: ScaleTrackProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const xLow  = toX(scaledLow);
  const xHigh = toX(scaledHigh);
  const xMid  = (xLow + xHigh) / 2;

  const midBandColor = SCORE_BANDS.find((b) => {
    const mid = (scaledLow + scaledHigh) / 2;
    return mid >= b.min && (b.max === 9.0 ? mid <= b.max : mid < b.max);
  })?.color ?? "green";

  function show(xPct: number, info: TooltipInfo, label: string) {
    setTooltip({ xPct, info });
    setActiveLabel(label);
  }

  function hide() {
    setTooltip(null);
    setActiveLabel(null);
  }

  // Clamp tooltip anchor so the popup stays within the card
  const tooltipLeft = tooltip
    ? `clamp(5%, ${tooltip.xPct}%, calc(100% - 5%))`
    : "50%";

  return (
    <div className="sv-track-wrapper" onMouseLeave={hide}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="sv-chart sv-scale-track"
        aria-hidden="true"
      >
        {SCORE_BANDS.map((band) => (
          <rect
            key={band.label}
            x={toX(band.min)}
            y={TRACK_Y}
            width={toX(band.max) - toX(band.min)}
            height={TRACK_H}
            fill={`var(--sv-band-${band.color})`}
            opacity={0.3}
          />
        ))}

        <rect
          x={0} y={TRACK_Y} width={100} height={TRACK_H} rx={2}
          fill="none" stroke="var(--border-subtle)" strokeWidth={0.35} opacity={0.9}
        />

        {/* CI range bar — hoverable */}
        <rect
          x={xLow}
          y={BAR_Y}
          width={Math.max(1.5, xHigh - xLow)}
          height={BAR_H}
          rx={1.5}
          fill={`var(--sv-band-${midBandColor})`}
          stroke={`var(--sv-band-${midBandColor})`}
          strokeWidth={0.25}
          opacity={activeLabel === "__ci" ? 1.0 : 0.9}
          style={{ cursor: "help" }}
          onMouseEnter={() => show(xMid, {
            title: `Your range · ${scaledLow.toFixed(1)}–${scaledHigh.toFixed(1)}`,
            body: "80% Wilson confidence interval on your practice accuracy. Wider with fewer questions; narrows as you answer more.",
          }, "__ci")}
        />

        {BENCHMARKS.map((bm) => {
          const x   = toX(bm.value);
          const tip = BENCHMARK_TOOLTIPS[bm.label];
          const active = activeLabel === bm.label;
          const labeled = LABELED.has(bm.label);
          const row = LABEL_ROW[bm.label] ?? "above";

          return (
            <g key={bm.label}>
              {/* Visible tick */}
              <line
                x1={x} y1={TICK_TOP} x2={x} y2={TICK_BOTTOM}
                stroke={active ? "var(--text-secondary)" : "var(--text-muted)"}
                strokeWidth={active ? 0.9 : (bm.isHighConfidence ? 0.6 : 0.4)}
                strokeDasharray={bm.isHighConfidence ? undefined : "1.2 0.9"}
                opacity={active ? 1.0 : (bm.isHighConfidence ? 0.75 : 0.4)}
              />
              {/* Wider transparent hit area */}
              {tip && (
                <line
                  x1={x} y1={TICK_TOP} x2={x} y2={TICK_BOTTOM}
                  strokeWidth={5}
                  stroke="transparent"
                  style={{ cursor: "help" }}
                  onMouseEnter={() => show(x, tip, bm.label)}
                />
              )}
              {labeled && (
                <text
                  x={x}
                  y={row === "above" ? LABEL_ABOVE_Y : LABEL_BELOW_Y}
                  textAnchor="middle"
                  fontSize={3.0}
                  fill="var(--text-muted)"
                  opacity={active ? 1.0 : 0.85}
                  style={{ pointerEvents: "none" }}
                >
                  {SHORT_LABEL[bm.label]}
                </text>
              )}
            </g>
          );
        })}

        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => (
          <text
            key={v}
            x={toX(v)}
            y={SCALE_Y}
            textAnchor="middle"
            fontSize={2.5}
            fill="var(--text-muted)"
            opacity={0.65}
            style={{ pointerEvents: "none" }}
          >
            {v}
          </text>
        ))}
      </svg>

      {tooltip && (
        <div className="sv-tooltip" style={{ left: tooltipLeft }}>
          <div className="sv-tooltip-title">{tooltip.info.title}</div>
          <div className="sv-tooltip-body">{tooltip.info.body}</div>
          {tooltip.info.badge && (
            <div className={`sv-tooltip-badge sv-tooltip-badge--${tooltip.info.badge.type}`}>
              {tooltip.info.badge.type === "official" ? "✓" : "~"} {tooltip.info.badge.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
