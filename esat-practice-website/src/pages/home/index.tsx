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
    <div className="sk-home">
      <div className="sk-frame">
        <span className="sk-screw sk-screw--tl" aria-hidden="true" />
        <span className="sk-screw sk-screw--tr" aria-hidden="true" />
        <span className="sk-screw sk-screw--bl" aria-hidden="true" />
        <span className="sk-screw sk-screw--br" aria-hidden="true" />

        <header className="sk-head">
          <div>
            <h1 className="sk-greeting">{greeting}</h1>
            <p className="sk-quote">{quote}</p>
          </div>
          <p className="sk-badge">
            {isQuestionBankLoading
              ? "Preparing question bank…"
              : `${questions.length} questions ready`}
          </p>
        </header>

        <div className="sk-divider" aria-hidden="true" />

        <button
          type="button"
          onClick={() => {
            void quickStart();
          }}
          disabled={!isQuestionBankReady}
          className="sk-cta"
        >
          <span>
            {isQuestionBankLoading
              ? "Loading question bank…"
              : "Quick start — 20 random questions"}
          </span>
        </button>

        <div className="sk-tiles">
          <Link to="/practice" className="sk-tile">
            Custom session
          </Link>
          <Link to="/question-bank" className="sk-tile">
            Browse questions
          </Link>
        </div>

        <OfflineNudge />

        {weakTopics.length > 0 && (
          <section className="sk-well">
            <h2 className="sk-well-title">Needs work</h2>
            {weakTopics.map((topicStat) => {
              const severity = topicStat.ewma_accuracy < 0.25 ? "crit" : "warn";
              return (
                <button
                  type="button"
                  key={topicStat.topic}
                  onClick={() => {
                    void drillTopic(topicStat.topic);
                  }}
                  className={`sk-topic sk-topic--${severity}`}
                >
                  <span className="sk-topic-name">{topicStat.topic}</span>
                  <span className="sk-topic-meta">
                    {`${Math.round(topicStat.ewma_accuracy * 100)}% · Drill now →`}
                  </span>
                </button>
              );
            })}
          </section>
        )}

        {recentSessions.length > 0 && (
          <section className="sk-well">
            <h2 className="sk-well-title">Recent</h2>
            {recentSessions.map((session) => {
              const isCompleted = session.state === "completed";
              const isActive = session.state === "active";
              const isClickable = isCompleted || isActive;
              return (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => {
                    if (isActive) {
                      navigate(`/session/${session.id}`);
                    } else if (isCompleted) {
                      navigate(`/results/${session.id}`);
                    }
                  }}
                  disabled={!isClickable}
                  className={`sk-recent ${isClickable ? "sk-recent--active" : "sk-recent--idle"}`}
                >
                  <span className="sk-recent-label">
                    {session.mode} session{isActive ? " — resume" : ""}
                  </span>
                  <span className="sk-recent-date">
                    {new Date(session.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    →
                  </span>
                </button>
              );
            })}
          </section>
        )}

        <span className="sk-dial" aria-hidden="true" />
      </div>

      <DisclaimerFooter />
    </div>
  );
}
