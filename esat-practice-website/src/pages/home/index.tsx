import { Link, useNavigate } from "react-router-dom";
import { useExcludedQuestionStore } from "../../lib/excludedQuestionStore";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { shuffle } from "../../lib/shuffle";
import { DisclaimerFooter } from "./DisclaimerFooter";
import { OfflineNudge } from "./OfflineNudge";
import { useHomeData } from "./useHomeData";

export default function Home() {
  const navigate = useNavigate();
  const { questions, isLoading, loaded } = useQuestionStore();
  const { createSession } = useSessionStore();
  const settings = useSettingsStore((state) => state.settings);
  const { excludedQuestionIds } = useExcludedQuestionStore();

  const { recentSessions, weakTopics, greeting, quote } = useHomeData();
  const isQuestionBankReady = loaded && !isLoading && questions.length > 0;
  const isQuestionBankLoading = !loaded || isLoading;

  async function quickStart() {
    if (!isQuestionBankReady) {
      return;
    }

    const available = questions.filter((q) => !excludedQuestionIds.has(q.id));
    const pool = available.length > 0 ? available : questions;
    const ids = shuffle(pool)
      .slice(0, 20)
      .map((question) => question.id);
    const session = await createSession({
      mode: "mixed",
      question_ids: ids,
      question_count: 20,
    });

    if (settings.fullscreenOnStart && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (err) {
        console.error("Error attempting to enable full-screen mode:", err);
      }
    }

    navigate(`/session/${session.id}`);
  }

  async function drillTopic(topic: string) {
    const ids = questions.flatMap((question) =>
      question.taxonomy.primary_topic === topic ? [question.id] : [],
    );
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
    <div className="page-shell max-w-3xl">
      <div className="page-head">
        <div>
          <h1 className="page-title">{greeting}</h1>
          <p className="page-subtitle">{quote}</p>
        </div>
        <p className="text-muted text-sm">
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
          className="quickstart-beam col-span-2 py-4 rounded-xl font-medium text-lg disabled:cursor-not-allowed"
        >
          {isQuestionBankLoading
            ? "Loading question bank..."
            : "Quick start - 20 random questions"}
        </button>
        <Link
          to="/practice"
          className="py-3 rounded-xl text-center text-sm font-medium text-secondary card"
        >
          Custom session
        </Link>
        <Link
          to="/question-bank"
          className="py-3 rounded-xl text-center text-sm font-medium text-secondary card"
        >
          Browse questions
        </Link>
      </div>

      <OfflineNudge />

      {weakTopics.length > 0 && (
        <section className="mb-8 card p-4">
          <h2 className="text-sm font-medium text-muted mb-3">
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
                className="w-full flex items-center justify-between px-4 py-3 border border-warning bg-amber-soft rounded-lg hover:border-strong transition-colors"
              >
                <span className="text-sm text-amber">{topicStat.topic}</span>
                <span className="text-xs text-amber">
                  {`${Math.round(topicStat.ewma_accuracy * 100)}% - Drill now ->`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recentSessions.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-medium text-muted mb-3">
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
                className="w-full flex items-center justify-between px-4 py-3 border border-subtle rounded-lg hover:border-strong transition-colors disabled:opacity-40"
              >
                <span className="text-sm text-secondary capitalize">{session.mode} session</span>
                <span className="text-xs text-muted">
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

      <DisclaimerFooter />
    </div>
  );
}
