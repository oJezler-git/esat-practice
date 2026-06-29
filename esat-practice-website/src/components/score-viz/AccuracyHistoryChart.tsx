import { useEffect, useState } from "react";
import { getSessionSummaries } from "../../lib/statsStore";
import type { SessionSummary } from "../../types/schema";

interface AccuracyHistoryChartProps {
  currentAccuracy: number;
}

interface ReferenceBand {
  label: string;
  lo: number;
  hi: number;
  color: string;
}

const REFERENCE_BANDS: ReferenceBand[] = [
  { label: "Average applicant",  lo: 41, hi: 47, color: "var(--sv-band-amber)"  },
  { label: "Typical offer",      lo: 54, hi: 64, color: "var(--sv-band-green)"  },
  { label: "Top 10%",            lo: 59, hi: 70, color: "var(--sv-band-teal)"   },
];

export function AccuracyHistoryChart({ currentAccuracy }: AccuracyHistoryChartProps) {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);

  useEffect(() => {
    getSessionSummaries()
      .then((rows) => setSummaries(rows.slice().reverse()))
      .catch(() => {});
  }, []);

  if (summaries.length < 3) return null;

  const W = 200;
  const H = 60;
  const PAD = { top: 6, right: 8, bottom: 18, left: 28 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allPcts = summaries.map((s) => s.accuracy * 100);
  const yMin = Math.max(0,   Math.min(...allPcts, currentAccuracy * 100) - 10);
  const yMax = Math.min(100, Math.max(...allPcts, currentAccuracy * 100) + 10);

  function toY(pct: number) {
    return PAD.top + chartH - ((pct - yMin) / (yMax - yMin)) * chartH;
  }
  function toXi(i: number, count: number) {
    return PAD.left + (i / Math.max(1, count - 1)) * chartW;
  }

  const histPoints = summaries.map((s, i) => ({
    x: toXi(i, summaries.length + 1),
    y: toY(s.accuracy * 100),
  }));

  const terminalX = toXi(summaries.length, summaries.length + 1);
  const terminalY = toY(currentAccuracy * 100);

  const polyline = histPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const lastHist = histPoints[histPoints.length - 1];

  return (
    <div className="sv-history">
      <div className="sv-history-title">Accuracy over time</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sv-chart"
        style={{ height: "5rem" }}
        aria-hidden="true"
      >
        {/* Reference bands */}
        {REFERENCE_BANDS.map((band) => {
          const bandLo = toY(band.hi);
          const bandHi = toY(band.lo);
          return (
            <rect
              key={band.label}
              x={PAD.left}
              y={Math.max(PAD.top, bandLo)}
              width={chartW}
              height={Math.max(0, Math.min(PAD.top + chartH, bandHi) - Math.max(PAD.top, bandLo))}
              fill={band.color}
              opacity={0.12}
            />
          );
        })}

        {/* Y-axis ticks */}
        {[Math.round(yMin), Math.round((yMin + yMax) / 2), Math.round(yMax)].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left - 3}
              y1={toY(v)}
              x2={PAD.left + chartW}
              y2={toY(v)}
              stroke="var(--border-subtle)"
              strokeWidth={0.5}
            />
            <text
              x={PAD.left - 4}
              y={toY(v) + 1.5}
              textAnchor="end"
              fontSize={4}
              fill="var(--text-muted)"
            >
              {v}%
            </text>
          </g>
        ))}

        {/* History polyline */}
        {histPoints.length > 1 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        )}

        {/* Dashed line from last history point to current session terminal */}
        {lastHist && (
          <line
            x1={lastHist.x}
            y1={lastHist.y}
            x2={terminalX}
            y2={terminalY}
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="2.5 2"
            opacity={0.75}
          />
        )}

        {/* Terminal point (current session) */}
        <circle cx={terminalX} cy={terminalY} r={2.5} fill="var(--accent)" />

        {/* History dots */}
        {histPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={1.5} fill="var(--accent)" opacity={0.6} />
        ))}
      </svg>
      <p className="sv-chart-caption">
        Accuracy % across completed sessions. Dashed point = this session.
        Reference zones are indicative estimates.
      </p>
    </div>
  );
}
