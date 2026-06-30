import { useEffect, useRef, useState } from "react";
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
  { label: "Average applicant", lo: 41, hi: 47, color: "var(--sv-band-amber)" },
  { label: "Typical offer",     lo: 54, hi: 64, color: "var(--sv-band-green)" },
  { label: "Top 10%",           lo: 59, hi: 70, color: "var(--sv-band-teal)"  },
];

const H = 180;
const PAD = { top: 14, right: 90, bottom: 28, left: 38 };

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AccuracyHistoryChart({ currentAccuracy }: AccuracyHistoryChartProps) {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [W, setW] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasData = summaries.length >= 3;

  useEffect(() => {
    getSessionSummaries()
      .then((rows) => setSummaries(rows.slice().reverse()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasData) return;
    const el = svgRef.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  if (!hasData) return null;

  const chartW = Math.max(0, W - PAD.left - PAD.right);
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
    summary: s,
  }));

  const terminalX = toXi(summaries.length, summaries.length + 1);
  const terminalY = toY(currentAccuracy * 100);
  const polyline = histPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const lastHist = histPoints[histPoints.length - 1];

  const hoveredPoint = hoveredIndex !== null ? histPoints[hoveredIndex] : null;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;

    let nearest = 0;
    let nearestDist = Infinity;
    histPoints.forEach((p, i) => {
      const d = Math.abs(p.x - svgX);
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    });

    if (nearestDist < 30) {
      setHoveredIndex(nearest);
      const containerRect = container.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top,
      });
    } else {
      setHoveredIndex(null);
      setTooltipPos(null);
    }
  }

  function handleMouseLeave() {
    setHoveredIndex(null);
    setTooltipPos(null);
  }

  const yTicks = [Math.round(yMin), Math.round((yMin + yMax) / 2), Math.round(yMax)];

  return (
    <div className="sv-history" ref={containerRef} style={{ position: "relative" }}>
      <div className="sv-history-title">Accuracy over time</div>
      <svg
        ref={svgRef}
        viewBox={W > 0 ? `0 0 ${W} ${H}` : undefined}
        width="100%"
        height={H}
        className="sv-chart"
        aria-hidden="true"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: hoveredIndex !== null ? "crosshair" : "default" }}
      >
        {W > 0 && (
          <>
            {/* Reference bands */}
            {REFERENCE_BANDS.map((band) => {
              const bandY1 = toY(band.hi);
              const bandY2 = toY(band.lo);
              const clampedY1 = Math.max(PAD.top, bandY1);
              const clampedY2 = Math.min(PAD.top + chartH, bandY2);
              const bandH = Math.max(0, clampedY2 - clampedY1);
              if (bandH === 0) return null;
              const midY = clampedY1 + bandH / 2;
              return (
                <g key={band.label}>
                  <rect
                    x={PAD.left}
                    y={clampedY1}
                    width={chartW}
                    height={bandH}
                    fill={band.color}
                    opacity={0.13}
                  />
                  {/* Band label on right */}
                  <text
                    x={PAD.left + chartW + 6}
                    y={midY}
                    dominantBaseline="middle"
                    fontSize={9}
                    fill={band.color}
                    opacity={0.85}
                    fontWeight={500}
                  >
                    {band.label}
                  </text>
                </g>
              );
            })}

            {/* Y-axis grid lines */}
            {yTicks.map((v) => (
              <g key={v}>
                <line
                  x1={PAD.left - 4}
                  y1={toY(v)}
                  x2={PAD.left + chartW}
                  y2={toY(v)}
                  stroke="var(--border-subtle)"
                  strokeWidth={0.8}
                />
                <text
                  x={PAD.left - 6}
                  y={toY(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="var(--text-muted)"
                >
                  {v}%
                </text>
              </g>
            ))}

            {/* Hover crosshair */}
            {hoveredPoint && (
              <>
                <line
                  x1={hoveredPoint.x}
                  y1={PAD.top}
                  x2={hoveredPoint.x}
                  y2={PAD.top + chartH}
                  stroke="var(--accent)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
                <line
                  x1={PAD.left}
                  y1={hoveredPoint.y}
                  x2={PAD.left + chartW}
                  y2={hoveredPoint.y}
                  stroke="var(--accent)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.3}
                />
              </>
            )}

            {/* Polyline */}
            {histPoints.length > 1 && (
              <polyline
                points={polyline}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            )}

            {/* Dashed line to terminal point */}
            {lastHist && (
              <line
                x1={lastHist.x}
                y1={lastHist.y}
                x2={terminalX}
                y2={terminalY}
                stroke="var(--accent)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.75}
              />
            )}

            {/* History dots */}
            {histPoints.map((p, i) => {
              const isHov = hoveredIndex === i;
              return (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={isHov ? 5 : 3}
                  fill={isHov ? "var(--accent)" : "var(--accent)"}
                  opacity={isHov ? 1 : 0.55}
                  style={{ transition: "r 120ms ease, opacity 120ms ease" }}
                />
              );
            })}

            {/* Hovered accuracy label */}
            {hoveredPoint && (
              <text
                x={hoveredPoint.x}
                y={hoveredPoint.y - 10}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="var(--accent)"
              >
                {Math.round(hoveredPoint.summary.accuracy * 100)}%
              </text>
            )}

            {/* Terminal dot + label */}
            <circle cx={terminalX} cy={terminalY} r={4.5} fill="var(--accent)" />
            <text
              x={terminalX}
              y={terminalY - 10}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--accent)"
            >
              {Math.round(currentAccuracy * 100)}%
            </text>
            <text
              x={terminalX}
              y={PAD.top + chartH + 16}
              textAnchor="middle"
              fontSize={9}
              fill="var(--text-muted)"
            >
              Now
            </text>
          </>
        )}
      </svg>

      {/* Hover tooltip */}
      {hoveredPoint && tooltipPos && (
        <div
          className="sv-chart-tooltip"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
          }}
        >
          <div className="sv-chart-tooltip__date">
            {fmtDate(hoveredPoint.summary.completed_at)}
          </div>
          <div className="sv-chart-tooltip__accuracy">
            {Math.round(hoveredPoint.summary.accuracy * 100)}%
          </div>
          <div className="sv-chart-tooltip__meta">
            {hoveredPoint.summary.correct}/{hoveredPoint.summary.attempts} correct
            &nbsp;·&nbsp;
            {fmtDuration(hoveredPoint.summary.total_time_ms)}
          </div>
        </div>
      )}

      <p className="sv-chart-caption">
        Accuracy % across completed sessions. Dashed point = this session.
        Reference zones are indicative estimates.
      </p>
    </div>
  );
}
