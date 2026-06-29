import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EsatAllTimePanel } from "../../components/score-viz/EsatAllTimePanel";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import { useStatsStore } from "../../lib/statsStore";
import type {
  CategoryStat,
  Session,
  SessionSummary,
  StatDimension,
  TopicStat,
} from "../../types/schema";

function accuracyColor(pct: number): string {
  return pct >= 70 ? "bg-green-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400";
}

function formatTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds <= 0) {
    return "-";
  }
  return totalSeconds >= 60
    ? `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
    : `${totalSeconds}s`;
}

const DIMENSION_LABELS: Record<StatDimension, string> = {
  program: "Programme",
  subject: "Subject",
  paper: "Paper",
};

export default function Progress() {
  const navigate = useNavigate();
  const { getAllStats, getCategoryStats, getSessionSummaries } = useStatsStore();
  const { getRecentSessions, createSession } = useSessionStore();
  const { questions } = useQuestionStore();

  const [stats, setStats] = useState<TopicStat[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [loadedStats, loadedSessions, loadedCategories, loadedSummaries] =
        await Promise.all([
          getAllStats(),
          getRecentSessions(10),
          getCategoryStats(),
          getSessionSummaries(),
        ]);
      if (!mounted) {
        return;
      }
      setStats(
        [...loadedStats].sort((left, right) => left.ewma_accuracy - right.ewma_accuracy),
      );
      setSessions(loadedSessions);
      setCategories(loadedCategories);
      setSummaries(loadedSummaries);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [getAllStats, getCategoryStats, getRecentSessions, getSessionSummaries]);

  const totalAttempts = useMemo(
    () => stats.reduce((total, stat) => total + stat.attempts, 0),
    [stats],
  );
  const totalCorrect = useMemo(
    () => stats.reduce((total, stat) => total + stat.correct, 0),
    [stats],
  );
  const overallPct =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  // The `program` dimension partitions every answered attempt exactly once, so it
  // is the canonical basis for overall time-per-question.
  const overallAvgTimeMs = useMemo(() => {
    const programs = categories.filter((cat) => cat.dimension === "program");
    const totalTime = programs.reduce((sum, cat) => sum + cat.total_time_ms, 0);
    const timed = programs.reduce((sum, cat) => sum + cat.timed_attempts, 0);
    return timed > 0 ? totalTime / timed : 0;
  }, [categories]);

  const weakTopics = useMemo(
    () => stats.filter((stat) => stat.ewma_accuracy < 0.5 && stat.attempts >= 3),
    [stats],
  );
  const strongTopics = useMemo(
    () => stats.filter((stat) => stat.ewma_accuracy >= 0.7 && stat.attempts >= 3),
    [stats],
  );

  async function drillWeak() {
    const weakTopicNames = new Set(weakTopics.map((topic) => topic.topic));
    const weakIds = questions
      .filter((question) => weakTopicNames.has(question.taxonomy.primary_topic))
      .map((question) => question.id);
    if (weakIds.length === 0) {
      return;
    }
    const session = await createSession({
      mode: "topic",
      question_ids: weakIds,
      question_count: weakIds.length,
    });
    navigate(`/session/${session.id}`);
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  }

  function formatDuration(session: Session) {
    if (!session.completed_at) {
      return "-";
    }
    return formatTime(session.completed_at - session.created_at);
  }

  return (
    <div className="page-shell max-w-3xl">
      <h1 className="page-title mb-8">Progress</h1>

      {totalAttempts === 0 ? (
        <div className="text-center py-20 text-muted">
          No attempts yet. Complete a session to see your progress.
        </div>
      ) : (
        <>
          <div className="prog-cards">
            <StatCard label="Overall accuracy" value={`${overallPct}%`} />
            <StatCard label="Questions answered" value={String(totalAttempts)} />
            <StatCard label="Sessions" value={String(summaries.length)} />
            <StatCard
              label="Avg / question"
              value={overallAvgTimeMs > 0 ? formatTime(overallAvgTimeMs) : "-"}
            />
          </div>

          {weakTopics.length > 0 && (
            <div className="mb-8 p-4 rounded-lg border border-warning bg-amber-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium text-amber mb-1">Weak areas to focus on</h2>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {weakTopics.map((topicStat) => (
                      <span
                        key={topicStat.topic}
                        className="text-xs px-2 py-0.5 bg-amber-soft text-amber rounded-full border border-warning"
                      >
                        {topicStat.topic} - {Math.round(topicStat.ewma_accuracy * 100)}%
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void drillWeak();
                  }}
                  className="flex-shrink-0 px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Drill these
                </button>
              </div>
            </div>
          )}

          {summaries.length > 0 && <TrendCard summaries={summaries} />}

          <EsatAllTimePanel stats={stats} />

          {categories.length > 0 && <CategoryCard categories={categories} />}

          <section className="prog-section card">
            <div className="prog-section-head">
              <h2 className="prog-section-title">Accuracy by topic</h2>
            </div>
            <div className="space-y-3">
              {stats.map((stat) => (
                <TopicBar key={stat.topic} stat={stat} />
              ))}
            </div>
          </section>

          {strongTopics.length > 0 && (
            <section className="prog-section card">
              <div className="prog-section-head">
                <h2 className="prog-section-title">Strong topics</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {strongTopics.map((topicStat) => (
                  <span
                    key={topicStat.topic}
                    className="text-xs px-2 py-0.5 bg-success-soft border border-success text-success-text rounded-full"
                  >
                    {topicStat.topic} - {Math.round(topicStat.ewma_accuracy * 100)}%
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="prog-section card">
            <div className="prog-section-head">
              <h2 className="prog-section-title">Recent sessions</h2>
            </div>
            {sessions.length === 0 ? (
              <p className="prog-muted">No sessions yet.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => {
                  const attemptCount = session.attempt_ids.length;
                  return (
                    <button
                      type="button"
                      key={session.id}
                      onClick={() => {
                        if (session.state === "completed") {
                          navigate(`/results/${session.id}`);
                        }
                      }}
                      className={`w-full flex items-center gap-4 px-4 py-3 border border-subtle rounded-lg text-left text-sm transition-colors ${
                        session.state === "completed"
                          ? "hover:border-strong cursor-pointer"
                          : "opacity-50 cursor-default"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="text-secondary capitalize">{session.mode} session</div>
                        <div className="text-xs text-muted mt-0.5">
                          {formatDate(session.created_at)} - {attemptCount} questions -{" "}
                          {formatDuration(session)}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          session.state === "completed"
                            ? "bg-success-soft border-success text-success-text"
                            : session.state === "abandoned"
                              ? "bg-soft border-subtle text-muted"
                              : "bg-surface-1 border-strong text-accent-strong"
                        }`}
                      >
                        {session.state}
                      </span>
                      {session.state === "completed" && (
                        <span className="text-muted text-xs">{"View ->"}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="prog-card">
      <div className="prog-card__value">{value}</div>
      <div className="prog-card__label">{label}</div>
    </div>
  );
}

type TrendMetric = "accuracy" | "time";

/**
 * Accuracy- or time-over-time sparkline derived from the per-session history.
 * Hand-rolled SVG (one polyline + an area fill) so it themes natively with the
 * CSS-variable palette and adds no chart dependency.
 */
function TrendCard({ summaries }: { summaries: SessionSummary[] }) {
  const [metric, setMetric] = useState<TrendMetric>("accuracy");

  // `getSessionSummaries` returns most-recent-first; trend reads left-to-right.
  const ordered = useMemo(
    () => [...summaries].sort((left, right) => left.completed_at - right.completed_at),
    [summaries],
  );

  const values = useMemo(
    () =>
      ordered.map((summary) =>
        metric === "accuracy" ? summary.accuracy : summary.avg_time_ms,
      ),
    [ordered, metric],
  );

  const width = 320;
  const height = 96;
  const padX = 6;
  const padY = 10;

  const maxValue =
    metric === "accuracy" ? 1 : Math.max(...values, 1);

  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : padX + (index / (values.length - 1)) * (width - 2 * padX);
    const ratio = maxValue > 0 ? value / maxValue : 0;
    const y = height - padY - ratio * (height - 2 * padY);
    return { x, y };
  });

  const linePath = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath =
    points.length > 0
      ? `M ${points[0].x},${height - padY} ` +
        points.map((p) => `L ${p.x},${p.y}`).join(" ") +
        ` L ${points[points.length - 1].x},${height - padY} Z`
      : "";

  const latest = values[values.length - 1] ?? 0;
  const summaryLabel =
    metric === "accuracy"
      ? `Latest ${Math.round(latest * 100)}%`
      : `Latest ${formatTime(latest)}`;

  return (
    <section className="prog-section card">
      <div className="prog-section-head">
        <h2 className="prog-section-title">Trend over sessions</h2>
        <div className="prog-toggle" role="group">
          {(["accuracy", "time"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMetric(value)}
              className={`prog-toggle__btn ${metric === value ? "prog-toggle__btn--active" : ""}`}
            >
              {value === "accuracy" ? "Accuracy" : "Avg time"}
            </button>
          ))}
        </div>
      </div>

      <svg
        className="prog-trend__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${metric === "accuracy" ? "Accuracy" : "Average time"} over ${values.length} session${values.length === 1 ? "" : "s"}`}
      >
        {areaPath && (
          <path d={areaPath} fill="var(--accent)" opacity={0.14} stroke="none" />
        )}
        {points.length > 1 && (
          <polyline
            points={linePath}
            fill="none"
            stroke="var(--accent-strong)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* The polyline carries multi-session trends. The single-session case
            has no line to draw, so it gets one small marker. (We skip per-point
            dots otherwise: preserveAspectRatio="none" stretches the viewBox, so
            they'd render as ellipses.) */}
        {points.length === 1 && (
          <rect
            x={points[0].x - 2}
            y={points[0].y - 2}
            width={4}
            height={4}
            rx={1.5}
            fill="var(--accent-strong)"
          />
        )}
      </svg>

      <div className="prog-trend__foot">
        <span>{ordered.length} completed sessions</span>
        <span className="prog-trend__latest">{summaryLabel}</span>
      </div>
    </section>
  );
}

/** Per-category (programme / subject / paper) accuracy + time rollups. */
function CategoryCard({ categories }: { categories: CategoryStat[] }) {
  const dimensions = useMemo(() => {
    const present = new Set(categories.map((cat) => cat.dimension));
    return (["program", "subject", "paper"] as const).filter((dim) =>
      present.has(dim),
    );
  }, [categories]);

  const [dimension, setDimension] = useState<StatDimension>(
    () => dimensions[0] ?? "program",
  );

  // Keep the selected dimension valid if the available set changes.
  const activeDimension = dimensions.includes(dimension)
    ? dimension
    : (dimensions[0] ?? "program");

  const rows = useMemo(
    () =>
      categories
        .filter((cat) => cat.dimension === activeDimension)
        .sort((left, right) => left.ewma_accuracy - right.ewma_accuracy),
    [categories, activeDimension],
  );

  if (dimensions.length === 0) {
    return null;
  }

  return (
    <section className="prog-section card">
      <div className="prog-section-head">
        <h2 className="prog-section-title">Breakdown</h2>
        <div className="prog-toggle" role="group">
          {dimensions.map((dim) => (
            <button
              key={dim}
              type="button"
              onClick={() => setDimension(dim)}
              className={`prog-toggle__btn ${activeDimension === dim ? "prog-toggle__btn--active" : ""}`}
            >
              {DIMENSION_LABELS[dim]}
            </button>
          ))}
        </div>
      </div>

      <div className="prog-cat-list">
        {rows.map((row) => {
          const pct = Math.round(row.ewma_accuracy * 100);
          return (
            <div className="prog-cat-row" key={row.id}>
              <div className="prog-cat-head">
                <span className="prog-cat-name">{row.key}</span>
                <span className="prog-cat-stats">
                  {row.correct}/{row.attempts}
                  {row.avg_time_ms > 0 && <> - {formatTime(row.avg_time_ms)}/q</>}
                  <span className="prog-cat-pct">{pct}%</span>
                </span>
              </div>
              <div className="prog-bar">
                <div
                  className={`prog-bar__fill ${accuracyColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TopicBar({ stat }: { stat: TopicStat }) {
  const pct = Math.round(stat.accuracy * 100);
  const ewmaPct = Math.round(stat.ewma_accuracy * 100);

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-secondary">{stat.topic}</span>
        <span className="text-muted tabular-nums">
          {stat.correct}/{stat.attempts}
          <span className="ml-2 text-muted font-medium">{ewmaPct}%</span>
          {pct !== ewmaPct && (
            <span className="ml-1 text-muted text-xs">(all-time {pct}%)</span>
          )}
        </span>
      </div>
      <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden relative">
        <div className="absolute h-full bg-surface-2 rounded-full" style={{ width: `${pct}%` }} />
        <div
          className={`absolute h-full rounded-full transition-all ${accuracyColor(ewmaPct)}`}
          style={{ width: `${ewmaPct}%` }}
        />
      </div>
    </div>
  );
}
