import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EsatAllTimePanel } from "../../components/score-viz/EsatAllTimePanel";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
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
  return pct >= 70 ? "sk-fill--green" : pct >= 40 ? "sk-fill--amber" : "sk-fill--red";
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

const DIMENSION_LABELS: Record<StatDimension, string> = {
  program: "Programme",
  subject: "Subject",
  paper: "Paper",
};

export default function Progress() {
  const navigate = useNavigate();
  const { getAllStats, getCategoryStats, getSessionSummaries } = useStatsStore();
  const { getRecentSessions, createSession } = useSessionStore();
  const { allQuestions } = useQuestionStore();

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
    const weakIds = allQuestions.flatMap((question) =>
      weakTopicNames.has(question.taxonomy.primary_topic) ? [question.id] : [],
    );
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

  return (
    <div className="sk-progress">
      <div className="sk-frame">
        <span className="sk-screw sk-screw--tl" />
        <span className="sk-screw sk-screw--tr" />
        <span className="sk-screw sk-screw--bl" />
        <span className="sk-screw sk-screw--br" />

        <h1 className="sk-progress-title">Progress</h1>

        {totalAttempts === 0 ? (
          <div className="sk-progress-empty">
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
              <div className="sk-progress-weak">
                <div className="sk-progress-weak-head">
                  <h2 className="sk-progress-weak-title">Weak areas to focus on</h2>
                  <button
                    type="button"
                    onClick={() => {
                      void drillWeak();
                    }}
                    className="sk-progress-drill"
                  >
                    <span>Drill these</span>
                  </button>
                </div>
                <div className="sk-progress-pills">
                  {weakTopics.map((topicStat) => (
                    <span key={topicStat.topic} className="sk-progress-pill">
                      {topicStat.topic} &ndash; {Math.round(topicStat.ewma_accuracy * 100)}%
                    </span>
                  ))}
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
              <div className="sk-progress-topics">
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
                <div className="sk-progress-pills">
                  {strongTopics.map((topicStat) => (
                    <span key={topicStat.topic} className="sk-progress-pill sk-progress-pill--good">
                      {topicStat.topic} &ndash; {Math.round(topicStat.ewma_accuracy * 100)}%
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
                <div className="sk-progress-sessions">
                  {sessions.map((session) => {
                    const attemptCount = session.attempt_ids.length;
                    const completed = session.state === "completed";
                    const active = session.state === "active";
                    const clickable = completed || active;
                    return (
                      <button
                        type="button"
                        key={session.id}
                        onClick={() => {
                          if (active) {
                            navigate(`/session/${session.id}`);
                          } else if (completed) {
                            navigate(`/results/${session.id}`);
                          }
                        }}
                        className={`sk-progress-session ${
                          clickable
                            ? "sk-progress-session--clickable"
                            : "sk-progress-session--idle"
                        }`}
                      >
                        <div>
                          <div className="sk-progress-session-label">{session.mode} session</div>
                          <div className="sk-progress-session-date">
                            {formatDate(session.created_at)} &middot; {attemptCount} questions &middot;{" "}
                            {formatDuration(session)}
                          </div>
                        </div>
                        <div className="sk-progress-session-right">
                          <span
                            className={`sk-progress-badge ${
                              completed
                                ? "sk-progress-badge--completed"
                                : "sk-progress-badge--idle"
                            }`}
                          >
                            {session.state}
                          </span>
                          {clickable && (
                            <span className="sk-progress-session-view">
                              {active ? "Resume →" : "View →"}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
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
        <SegmentedControl
          className="sk-seg--compact"
          ariaLabel="Trend metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "accuracy", label: "Accuracy" },
            { value: "time", label: "Avg time" },
          ]}
        />
      </div>

      <div className="sk-progress-trend-well">
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
      </div>

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
        <SegmentedControl
          className="sk-seg--compact"
          ariaLabel="Breakdown dimension"
          value={activeDimension}
          onChange={setDimension}
          options={dimensions.map((dim) => ({
            value: dim,
            label: DIMENSION_LABELS[dim],
          }))}
        />
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
      <div className="sk-progress-topic-head">
        <span className="sk-progress-topic-name">{stat.topic}</span>
        <span className="sk-progress-topic-stat">
          {stat.correct}/{stat.attempts}
          <span className="sk-progress-topic-ewma">{ewmaPct}%</span>
          {pct !== ewmaPct && (
            <span className="sk-progress-topic-alltime">(all-time {pct}%)</span>
          )}
        </span>
      </div>
      <div className="sk-progress-bar sk-progress-bar--track">
        <div className="sk-progress-bar-ghost" style={{ width: `${pct}%` }} />
        <div
          className={`sk-progress-bar-fill sk-progress-bar-fill--abs ${accuracyColor(ewmaPct)}`}
          style={{ width: `${ewmaPct}%` }}
        />
      </div>
    </div>
  );
}
