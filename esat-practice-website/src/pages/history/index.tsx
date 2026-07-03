import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "../../lib/sessionStore";
import { useStatsStore } from "../../lib/statsStore";
import type { Session, SessionSummary } from "../../types/schema";

function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s <= 0) return "-";
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

interface SessionRow {
  session: Session;
  summary: SessionSummary | null;
}

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

export default function HistoryPage() {
  const navigate = useNavigate();
  const { getAllSessions } = useSessionStore();
  const { getSessionSummaries } = useStatsStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [loadedSessions, loadedSummaries] = await Promise.all([
        getAllSessions(),
        getSessionSummaries(),
      ]);
      if (!mounted) return;
      setSessions(loadedSessions);
      setSummaries(loadedSummaries);
      setIsLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [getAllSessions, getSessionSummaries]);

  const summaryMap = useMemo(
    () => new Map(summaries.map((s) => [s.session_id, s])),
    [summaries],
  );

  const rows: SessionRow[] = useMemo(
    () =>
      sessions.map((session) => ({
        session,
        summary: summaryMap.get(session.id) ?? null,
      })),
    [sessions, summaryMap],
  );

  // Heatmap: date → questions answered that day
  const heatmapData = useMemo(() => {
    const map = new Map<string, number>();
    for (const { session, summary } of rows) {
      if (session.state !== "completed" || !summary) continue;
      const date = toDateStr(session.completed_at ?? session.created_at);
      map.set(date, (map.get(date) ?? 0) + summary.attempts);
    }
    return map;
  }, [rows]);

  // 26-week grid starting from the Monday 25 full weeks ago
  const heatmapGrid = useMemo(() => {
    const today = new Date();
    const thisMonday = getMondayOfWeek(today);
    const gridStart = new Date(thisMonday);
    gridStart.setDate(gridStart.getDate() - 25 * 7);

    const weeks: { date: string; ts: number }[][] = [];
    const cursor = new Date(gridStart);
    for (let w = 0; w < 26; w++) {
      const week: { date: string; ts: number }[] = [];
      for (let d = 0; d < 7; d++) {
        week.push({ date: toDateStr(cursor.getTime()), ts: cursor.getTime() });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, []);

  // Month label positions derived from grid
  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (let wi = 0; wi < heatmapGrid.length; wi++) {
      const firstDay = new Date(heatmapGrid[wi][0].ts);
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        labels.push({
          label: firstDay.toLocaleDateString("en-GB", { month: "short" }),
          col: wi,
        });
        lastMonth = month;
      }
    }
    return labels;
  }, [heatmapGrid]);

  // Streak calculation
  const { currentStreak, bestStreak } = useMemo(() => {
    const activeDates = new Set(
      rows.flatMap((r) =>
        r.session.state === "completed" && r.session.completed_at
          ? [toDateStr(r.session.completed_at)]
          : [],
      ),
    );

    // Current streak: count backward from today
    let streak = 0;
    const c = new Date();
    c.setHours(12, 0, 0, 0);
    while (activeDates.has(toDateStr(c.getTime()))) {
      streak++;
      c.setDate(c.getDate() - 1);
    }

    // Best streak
    const sorted = [...activeDates].sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sorted) {
      if (prev === null) {
        run = 1;
      } else {
        const gap = Math.round(
          (new Date(d + "T12:00:00").getTime() -
            new Date(prev + "T12:00:00").getTime()) /
            86400000,
        );
        run = gap === 1 ? run + 1 : 1;
      }
      best = Math.max(best, run);
      prev = d;
    }

    return { currentStreak: streak, bestStreak: best };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!selectedDate) return rows;
    return rows.filter(({ session }) => {
      const ts = session.completed_at ?? session.created_at;
      return toDateStr(ts) === selectedDate;
    });
  }, [rows, selectedDate]);

  const completedCount = useMemo(
    () => rows.filter((r) => r.session.state === "completed").length,
    [rows],
  );
  const totalQuestions = useMemo(
    () => summaries.reduce((sum, s) => sum + s.attempts, 0),
    [summaries],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        Loading…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="page-shell max-w-3xl">
        <h1 className="page-title mb-8">History</h1>
        <div className="text-center py-20 text-muted">
          No sessions yet. Complete a session to start building your history.
        </div>
      </div>
    );
  }

  const today = toDateStr(Date.now());

  return (
    <div className="page-shell max-w-3xl">
      <h1 className="page-title mb-8">History</h1>

      {/* Stats strip */}
      <div className="hist-stats">
        <HistStat label="Sessions" value={String(completedCount)} />
        <HistStat label="Questions answered" value={String(totalQuestions)} />
        <HistStat
          label="Current streak"
          value={`${currentStreak}d`}
          highlight={currentStreak > 0}
        />
        <HistStat label="Best streak" value={`${bestStreak}d`} />
      </div>

      {/* Heatmap */}
      <section className="card hist-heatmap-section">
        <div className="prog-section-head">
          <h2 className="prog-section-title">Activity — last 26 weeks</h2>
          {selectedDate && (
            <button
              type="button"
              className="hist-clear-btn"
              onClick={() => setSelectedDate(null)}
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
                    if (count > 0)
                      setSelectedDate(isSelected ? null : date);
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

      {/* Session list */}
      <section>
        <div className="prog-section-head mb-3">
          <h2 className="prog-section-title">
            {selectedDate
              ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : "All sessions"}
          </h2>
          <span className="text-xs text-muted">{filteredRows.length}</span>
        </div>

        <div className="hist-list">
          {filteredRows.map(({ session, summary }) => (
            <SessionCard
              key={session.id}
              session={session}
              summary={summary}
              onNavigate={() => navigate(`/results/${session.id}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function HistStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`hist-stat ${highlight ? "hist-stat--highlight" : ""}`}>
      <div className="hist-stat__value">{value}</div>
      <div className="hist-stat__label">{label}</div>
    </div>
  );
}

function SessionCard({
  session,
  summary,
  onNavigate,
}: {
  session: Session;
  summary: SessionSummary | null;
  onNavigate: () => void;
}) {
  const ts = session.completed_at ?? session.created_at;
  const d = new Date(ts);
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "short" });

  const isCompleted = session.state === "completed";
  const accuracy = summary ? Math.round(summary.accuracy * 100) : null;
  const totalQ = summary
    ? summary.attempts + summary.skipped
    : session.attempt_ids.length;

  let borderColor: string;
  if (!isCompleted || accuracy === null) {
    borderColor = "var(--border-subtle)";
  } else if (accuracy >= 70) {
    borderColor = "var(--color-success-text)";
  } else if (accuracy >= 40) {
    borderColor = "var(--color-amber)";
  } else {
    borderColor = "var(--color-danger-text)";
  }

  const duration =
    session.completed_at
      ? formatTime(session.completed_at - session.created_at)
      : null;

  const correctFrac = summary && totalQ > 0 ? summary.correct / totalQ : 0;
  const incorrectFrac =
    summary && totalQ > 0
      ? (summary.attempts - summary.correct) / totalQ
      : 0;

  return (
    <button
      type="button"
      disabled={!isCompleted}
      onClick={isCompleted ? onNavigate : undefined}
      className={`hist-card ${isCompleted ? "hist-card--clickable" : ""}`}
      style={{ "--hist-border": borderColor } as React.CSSProperties}
    >
      <div className="hist-card__date">
        <span className="hist-card__day">{day}</span>
        <span className="hist-card__month">{month}</span>
      </div>

      <div className="hist-card__body">
        <div className="hist-card__top">
          <span className={`hist-badge hist-badge--${session.mode}`}>
            {session.mode}
          </span>
          {!isCompleted && (
            <span className="hist-badge">{session.state}</span>
          )}
          {summary && (
            <span className="hist-card__score-label">
              {summary.correct}/{totalQ}
            </span>
          )}
        </div>

        {summary && totalQ > 0 && (
          <div className="hist-score-bar" role="presentation">
            <div
              className="hist-score-bar__correct"
              style={{ width: `${correctFrac * 100}%` }}
            />
            <div
              className="hist-score-bar__incorrect"
              style={{ width: `${incorrectFrac * 100}%` }}
            />
          </div>
        )}

        <div className="hist-card__meta">
          <span>{totalQ} questions</span>
          {summary && summary.avg_time_ms > 0 && (
            <>
              <span className="hist-meta-sep">·</span>
              <span>{formatTime(summary.avg_time_ms)}/q avg</span>
            </>
          )}
        </div>
      </div>

      <div className="hist-card__right">
        {accuracy !== null && (
          <span className="hist-pct" style={{ color: borderColor }}>
            {accuracy}%
          </span>
        )}
        {duration && (
          <span className="hist-card__duration">{duration}</span>
        )}
        {isCompleted && (
          <span className="hist-card__arrow" aria-hidden="true">
            →
          </span>
        )}
      </div>
    </button>
  );
}
