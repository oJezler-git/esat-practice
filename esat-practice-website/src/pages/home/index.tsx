import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import { useStatsStore } from "../../lib/statsStore";
import type { Session, TopicStat } from "../../types/schema";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

export default function Home() {
  const navigate = useNavigate();
  const { questions, isLoading, loaded } = useQuestionStore();
  const { getRecentSessions, createSession } = useSessionStore();
  const { getAllStats } = useStatsStore();

  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [weakTopics, setWeakTopics] = useState<TopicStat[]>([]);
  const isQuestionBankReady = loaded && !isLoading && questions.length > 0;
  const isQuestionBankLoading = !loaded || isLoading;

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [sessions, stats] = await Promise.all([getRecentSessions(3), getAllStats()]);
      if (!mounted) {
        return;
      }
      setRecentSessions(sessions);
      setWeakTopics(
        stats.filter((stat) => stat.ewma_accuracy < 0.5 && stat.attempts >= 3).slice(0, 3),
      );
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [getAllStats, getRecentSessions]);

  async function quickStart() {
    if (!isQuestionBankReady) {
      return;
    }

    const ids = shuffle(questions)
      .slice(0, 20)
      .map((question) => question.id);
    const session = await createSession({
      mode: "mixed",
      question_ids: ids,
      question_count: 20,
    });
    navigate(`/session/${session.id}`);
  }

  async function drillTopic(topic: string) {
    const ids = questions
      .filter((question) => question.taxonomy.primary_topic === topic)
      .map((question) => question.id);
    if (ids.length === 0) {
      return;
    }
    const session = await createSession({
      mode: "topic",
      question_ids: ids,
      topic_filter: [topic],
      question_count: ids.length,
    });
    navigate(`/session/${session.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-medium mb-1">ESAT Practice</h1>
        <p className="text-gray-400 text-sm">
          {isQuestionBankLoading
            ? "Preparing question bank..."
            : `${questions.length} questions ready`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-10">
        <button
          type="button"
          onClick={() => {
            void quickStart();
          }}
          disabled={!isQuestionBankReady}
          className="col-span-2 py-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors text-lg disabled:bg-indigo-300 disabled:cursor-not-allowed shadow"
        >
          {isQuestionBankLoading
            ? "Loading question bank..."
            : "Quick start - 20 random questions"}
        </button>
        <Link
          to="/practice"
          className="py-3 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
        >
          Custom session
        </Link>
        <Link
          to="/question-bank"
          className="py-3 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
        >
          Browse questions
        </Link>
      </div>

      {weakTopics.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Needs work
          </h2>
          <div className="space-y-2">
            {weakTopics.map((topicStat) => (
              <button
                type="button"
                key={topicStat.topic}
                onClick={() => {
                  void drillTopic(topicStat.topic);
                }}
                className="w-full flex items-center justify-between px-4 py-3 border border-amber-200 bg-amber-50 rounded-lg hover:border-amber-300 transition-colors"
              >
                <span className="text-sm text-amber-800">{topicStat.topic}</span>
                <span className="text-xs text-amber-600">
                  {`${Math.round(topicStat.ewma_accuracy * 100)}% - Drill now ->`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recentSessions.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Recent
          </h2>
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => {
                  if (session.state === "completed") {
                    navigate(`/results/${session.id}`);
                  }
                }}
                disabled={session.state !== "completed"}
                className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40"
              >
                <span className="text-sm text-gray-700 capitalize">{session.mode} session</span>
                <span className="text-xs text-gray-400">
                  {new Date(session.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  {"->"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
