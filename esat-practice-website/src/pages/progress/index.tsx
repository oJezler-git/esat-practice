import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import { useStatsStore } from "../../lib/statsStore";
import type { Session, TopicStat } from "../../types/schema";

export default function Progress() {
  const navigate = useNavigate();
  const { getAllStats } = useStatsStore();
  const { getRecentSessions, createSession } = useSessionStore();
  const { questions } = useQuestionStore();

  const [stats, setStats] = useState<TopicStat[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [loadedStats, loadedSessions] = await Promise.all([
        getAllStats(),
        getRecentSessions(10),
      ]);
      if (!mounted) {
        return;
      }
      setStats(
        [...loadedStats].sort((left, right) => left.ewma_accuracy - right.ewma_accuracy),
      );
      setSessions(loadedSessions);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [getAllStats, getRecentSessions]);

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
    const totalSeconds = Math.round((session.completed_at - session.created_at) / 1000);
    return totalSeconds >= 60
      ? `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
      : `${totalSeconds}s`;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-medium mb-8">Progress</h1>

      {totalAttempts === 0 ? (
        <div className="text-center py-20 text-gray-400">
          No attempts yet. Complete a session to see your progress.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-10">
            <StatCard label="Overall accuracy" value={`${overallPct}%`} />
            <StatCard label="Questions answered" value={String(totalAttempts)} />
            <StatCard label="Sessions" value={String(sessions.length)} />
          </div>

          {weakTopics.length > 0 && (
            <div className="mb-8 p-4 rounded-lg border border-amber-200 bg-amber-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium text-amber-800 mb-1">Weak areas to focus on</h2>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {weakTopics.map((topicStat) => (
                      <span
                        key={topicStat.topic}
                        className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200"
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

          <section className="mb-10">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
              Accuracy by topic
            </h2>
            <div className="space-y-3">
              {stats.map((stat) => (
                <TopicBar key={stat.topic} stat={stat} />
              ))}
            </div>
          </section>

          {strongTopics.length > 0 && (
            <section className="mb-10">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
                Strong topics
              </h2>
              <div className="flex flex-wrap gap-2">
                {strongTopics.map((topicStat) => (
                  <span
                    key={topicStat.topic}
                    className="text-xs px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-full"
                  >
                    {topicStat.topic} - {Math.round(topicStat.ewma_accuracy * 100)}%
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
              Recent sessions
            </h2>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-400">No sessions yet.</p>
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
                      className={`w-full flex items-center gap-4 px-4 py-3 border border-gray-200 rounded-lg text-left text-sm transition-colors ${
                        session.state === "completed"
                          ? "hover:border-gray-300 cursor-pointer"
                          : "opacity-50 cursor-default"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="text-gray-700 capitalize">{session.mode} session</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {formatDate(session.created_at)} - {attemptCount} questions -{" "}
                          {formatDuration(session)}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          session.state === "completed"
                            ? "bg-green-50 border-green-200 text-green-700"
                            : session.state === "abandoned"
                              ? "bg-gray-50 border-gray-200 text-gray-400"
                              : "bg-blue-50 border-blue-200 text-blue-600"
                        }`}
                      >
                        {session.state}
                      </span>
                      {session.state === "completed" && (
                        <span className="text-gray-300 text-xs">{"View ->"}</span>
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
    <div className="border border-gray-200 bg-white rounded-lg px-4 py-4 text-center shadow">
      <div className="text-2xl font-medium text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function TopicBar({ stat }: { stat: TopicStat }) {
  const pct = Math.round(stat.accuracy * 100);
  const ewmaPct = Math.round(stat.ewma_accuracy * 100);
  const color =
    ewmaPct >= 70 ? "bg-green-400" : ewmaPct >= 40 ? "bg-amber-400" : "bg-red-400";

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{stat.topic}</span>
        <span className="text-gray-400 tabular-nums">
          {stat.correct}/{stat.attempts}
          <span className="ml-2 text-gray-500 font-medium">{ewmaPct}%</span>
          {pct !== ewmaPct && (
            <span className="ml-1 text-gray-300 text-xs">(all-time {pct}%)</span>
          )}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
        <div className="absolute h-full bg-gray-200 rounded-full" style={{ width: `${pct}%` }} />
        <div
          className={`absolute h-full rounded-full transition-all ${color}`}
          style={{ width: `${ewmaPct}%` }}
        />
      </div>
    </div>
  );
}
