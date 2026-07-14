import { Link, useNavigate } from "react-router-dom";
import { useExcludedQuestionStore } from "../../lib/excludedQuestionStore";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { shuffle } from "../../lib/shuffle";
import { DisclaimerFooter } from "./DisclaimerFooter";
import { OfflineNudge } from "./OfflineNudge";
import { SkeuoFrame } from "./SkeuoFrame";
import { useHomeData } from "./useHomeData";

function formatElapsed(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function Home() {
  const navigate = useNavigate();
  const { questions, isLoading, loaded } = useQuestionStore();
  const { createSession, abandonSession } = useSessionStore();
  const settings = useSettingsStore((state) => state.settings);
  const { excludedQuestionIds } = useExcludedQuestionStore();

  const { recentSessions, weakTopics, greeting, quote, reload } = useHomeData();
  const isQuestionBankReady = loaded && !isLoading && questions.length > 0;
  const isQuestionBankLoading = !loaded || isLoading;
  const activeSession = recentSessions.find((session) => session.state === "active") ?? null;

  async function quickStart() {
    if (!isQuestionBankReady || activeSession) {
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

  async function handleDiscard() {
    if (!activeSession) {
      return;
    }
    await abandonSession(activeSession.id);
    await reload();
  }

  async function drillTopic(topic: string) {
    if (activeSession) {
      return;
    }
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
      <SkeuoFrame>
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
          disabled={!isQuestionBankReady || Boolean(activeSession)}
          className="sk-cta"
        >
          <span>
            {isQuestionBankLoading
              ? "Loading question bank…"
              : activeSession
                ? "Resume or discard your unfinished session first"
                : "Quick start — 20 random questions"}
          </span>
        </button>

        {activeSession && (
          <div className="sk-resume">
            <div>
              <p className="sk-resume-title">
                Unfinished session from {formatElapsed(Date.now() - activeSession.created_at)}
              </p>
              <p className="sk-resume-meta">
                {activeSession.attempt_ids.length} of{" "}
                {activeSession.config.question_count ?? activeSession.config.question_ids.length}{" "}
                answered
              </p>
            </div>
            <div className="sk-resume-actions">
              <button
                type="button"
                onClick={() => {
                  void handleDiscard();
                }}
                className="sk-resume-discard"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => navigate(`/session/${activeSession.id}`)}
                className="sk-resume-resume"
              >
                Resume
              </button>
            </div>
          </div>
        )}

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
                  disabled={Boolean(activeSession)}
                  className={`sk-topic sk-topic--${severity}`}
                >
                  <span className="sk-topic-name">{topicStat.topic}</span>
                  <span className="sk-topic-meta">
                    {activeSession
                      ? `${Math.round(topicStat.ewma_accuracy * 100)}%`
                      : `${Math.round(topicStat.ewma_accuracy * 100)}% · Drill now →`}
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
      </SkeuoFrame>

      <DisclaimerFooter />
    </div>
  );
}
