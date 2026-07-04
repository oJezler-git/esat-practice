import { toDateStr } from "./useHistoryData";

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const PAD_LEFT = 22;
const PAD_TOP = 16;
const SVG_W = PAD_LEFT + 26 * STEP - GAP;
const SVG_H = PAD_TOP + 7 * STEP - GAP;

const DAY_LABELS = [
  { row: 0, label: "Mo" },
  { row: 2, label: "We" },
  { row: 4, label: "Fr" },
  { row: 6, label: "Su" },
];

function cellFill(count: number): string {
  if (count === 0) return "var(--hist-cell-0)";
  if (count <= 5) return "var(--hist-cell-1)";
  if (count <= 15) return "var(--hist-cell-2)";
  if (count <= 30) return "var(--hist-cell-3)";
  return "var(--hist-cell-4)";
}

interface ActivityHeatmapProps {
  heatmapGrid: { date: string; ts: number }[][];
  heatmapData: Map<string, number>;
  monthLabels: { label: string; col: number }[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

export function ActivityHeatmap({
  heatmapGrid,
  heatmapData,
  monthLabels,
  selectedDate,
  onSelectDate,
}: ActivityHeatmapProps) {
  const today = toDateStr(Date.now());

  return (
    <section className="card hist-heatmap-section">
      <div className="prog-section-head">
        <h2 className="prog-section-title">Activity — last 26 weeks</h2>
        {selectedDate && (
          <button
            type="button"
            className="hist-clear-btn"
            onClick={() => onSelectDate(null)}
          >
            Clear filter ×
          </button>
        )}
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        className="hist-svg"
        aria-label="Practice activity heatmap — darker cells mean more questions answered"
      >
        {/* Day-of-week labels */}
        {DAY_LABELS.map(({ row, label }) => (
          <text
            key={label}
            x={PAD_LEFT - 4}
            y={PAD_TOP + row * STEP + CELL / 2}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={7.5}
            fill="var(--text-muted)"
            aria-hidden="true"
          >
            {label}
          </text>
        ))}

        {/* Month labels */}
        {monthLabels.map(({ label, col }) => (
          <text
            key={label + col}
            x={PAD_LEFT + col * STEP}
            y={PAD_TOP - 4}
            fontSize={7.5}
            fill="var(--text-muted)"
            aria-hidden="true"
          >
            {label}
          </text>
        ))}

        {/* Cells */}
        {heatmapGrid.map((week, wi) =>
          week.map(({ date, ts }, di) => {
            if (ts > Date.now() + 86400000) return null;
            const count = heatmapData.get(date) ?? 0;
            const isSelected = selectedDate === date;
            const isToday = date === today;
            return (
              <rect
                key={date}
                x={PAD_LEFT + wi * STEP}
                y={PAD_TOP + di * STEP}
                width={CELL}
                height={CELL}
                rx={2.5}
                fill={cellFill(count)}
                stroke={
                  isSelected
                    ? "var(--accent-strong)"
                    : isToday
                      ? "var(--border-strong)"
                      : "none"
                }
                strokeWidth={isSelected || isToday ? 1.5 : 0}
                style={{ cursor: count > 0 ? "pointer" : "default" }}
                onClick={() => {
                  if (count > 0) onSelectDate(isSelected ? null : date);
                }}
              >
                <title>
                  {new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  {count > 0
                    ? ` — ${count} question${count !== 1 ? "s" : ""}`
                    : ""}
                </title>
              </rect>
            );
          }),
        )}
      </svg>

      {/* Legend */}
      <div className="hist-legend">
        <span className="hist-legend-text">Less</span>
        {([0, 3, 10, 20, 35] as const).map((count, i) => (
          <div
            key={i}
            className="hist-legend-cell"
            style={{ background: cellFill(count) }}
          />
        ))}
        <span className="hist-legend-text">More</span>
      </div>
    </section>
  );
}
