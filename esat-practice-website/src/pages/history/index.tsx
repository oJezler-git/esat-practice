import { useNavigate } from "react-router-dom";
import type { Session, SessionSummary } from "../../types/schema";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { useHistoryData } from "./useHistoryData";
import { useVirtualSessionList } from "./useVirtualSessionList";

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s <= 0) return "-";
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const {
    isLoading,
    sessions,
    heatmapData,
    heatmapGrid,
    monthLabels,
    currentStreak,
    bestStreak,
    filteredRows,
    completedCount,
    totalQuestions,
    selectedDate,
    setSelectedDate,
  } = useHistoryData();

  const { listRef, rowHeight, startIndex, endIndex, totalHeight } =
    useVirtualSessionList(filteredRows.length);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        Loading…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="sk-history">
        <div className="sk-frame">
          <span className="sk-screw sk-screw--tl" />
          <span className="sk-screw sk-screw--tr" />
          <span className="sk-screw sk-screw--bl" />
          <span className="sk-screw sk-screw--br" />
          <h1 className="sk-history-title">History</h1>
          <div className="sk-history-empty">
            No sessions yet. Complete a session to start building your history.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-history">
      <div className="sk-frame">
        <span className="sk-screw sk-screw--tl" />
        <span className="sk-screw sk-screw--tr" />
        <span className="sk-screw sk-screw--bl" />
        <span className="sk-screw sk-screw--br" />

        <h1 className="sk-history-title">History</h1>

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

      <ActivityHeatmap
        heatmapGrid={heatmapGrid}
        heatmapData={heatmapData}
        monthLabels={monthLabels}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

        {/* Session list */}
        <section className="sk-history-sessions">
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

          <div className="hist-list" ref={listRef}>
            <div style={{ height: totalHeight, position: "relative" }}>
              {filteredRows.slice(startIndex, endIndex).map(({ session, summary }, offset) => {
                const index = startIndex + offset;
                return (
                  <div
                    key={session.id}
                    style={{
                      position: "absolute",
                      top: index * rowHeight,
                      left: 0,
                      right: 0,
                    }}
                  >
                    <SessionCard
                      session={session}
                      summary={summary}
                      onNavigate={() =>
                        navigate(
                          session.state === "active"
                            ? `/session/${session.id}`
                            : `/results/${session.id}`,
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
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
  const isActive = session.state === "active";
  const isClickable = isCompleted || isActive;
  const accuracy = summary ? Math.round(summary.accuracy * 100) : null;
  const totalQ = summary
    ? summary.attempts + summary.skipped
    : session.attempt_ids.length;

  let borderColor: string;
  if (!isCompleted || accuracy === null) {
    borderColor = isActive ? "var(--accent)" : "var(--border-subtle)";
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
      disabled={!isClickable}
      onClick={isClickable ? onNavigate : undefined}
      className={`hist-card ${isClickable ? "hist-card--clickable" : ""}`}
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
        {isActive && <span className="hist-card__duration">Resume</span>}
        {isClickable && (
          <span className="hist-card__arrow" aria-hidden="true">
            →
          </span>
        )}
      </div>
    </button>
  );
}
