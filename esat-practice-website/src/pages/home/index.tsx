import { useEffect, useReducer, useRef, useState, type TransitionEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useExcludedQuestionStore } from "../../lib/excludedQuestionStore";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import { useStatsStore } from "../../lib/statsStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { getRandomQuote, getTimeBasedGreeting } from "../../lib/motivationalContent";
import { shuffle } from "../../lib/shuffle";
import { getOfflineDownloadState } from "../../lib/offlineDownload";
import { isInstalledPWA } from "../../lib/pwa";
import type { Session, TopicStat } from "../../types/schema";


interface CachedGreeting {
  greeting: string;
  quote: string;
  hourGenerated: number;
}

type HomeDataState = {
  recentSessions: Session[];
  weakTopics: TopicStat[];
  greeting: string;
  quote: string;
};

type HomeDataAction =
  | { type: "set_content"; greeting: string; quote: string }
  | { type: "set_data"; recentSessions: Session[]; weakTopics: TopicStat[] };

function homeDataReducer(state: HomeDataState, action: HomeDataAction): HomeDataState {
  switch (action.type) {
    case "set_content":
      return { ...state, greeting: action.greeting, quote: action.quote };
    case "set_data":
      return { ...state, recentSessions: action.recentSessions, weakTopics: action.weakTopics };
    default:
      return state;
  }
}

export default function Home() {
  const navigate = useNavigate();
  const { questions, isLoading, loaded } = useQuestionStore();
  const { getRecentSessions, createSession } = useSessionStore();
  const { getAllStats } = useStatsStore();
  const settings = useSettingsStore((state) => state.settings);
  const { excludedQuestionIds } = useExcludedQuestionStore();

  const [homeData, dispatchData] = useReducer(homeDataReducer, { recentSessions: [], weakTopics: [], greeting: "", quote: "" });
  const { recentSessions, weakTopics, greeting, quote } = homeData;
  const [showOfflineNudge, setShowOfflineNudge] = useState(
    () => isInstalledPWA() && !getOfflineDownloadState() && localStorage.getItem("offline_nudge_dismissed") !== "true"
  );
  const [footerDismissed, setFooterDismissed] = useState(false);
  const [footerState, setFooterState] = useState<"idle" | "confirming" | "closing">("idle");
  const confirmTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const isQuestionBankReady = loaded && !isLoading && questions.length > 0;
  const isQuestionBankLoading = !loaded || isLoading;

  useEffect(() => {
    const dismissed = localStorage.getItem("footer_dismissed") === "true";
    setFooterDismissed(dismissed);

    return () => {
      if (confirmTimeoutRef.current !== null) {
        window.clearTimeout(confirmTimeoutRef.current);
      }
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const isFooterConfirming = footerState === "confirming" || footerState === "closing";
  const isFooterClosing = footerState === "closing";

  function handleFooterClose() {
    if (footerState === "closing") {
      return;
    }

    if (footerState === "confirming") {
      if (confirmTimeoutRef.current !== null) {
        window.clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }

      setFooterState("closing");
      closeTimeoutRef.current = window.setTimeout(() => {
        localStorage.setItem("footer_dismissed", "true");
        setFooterDismissed(true);
        setFooterState("idle");
        closeTimeoutRef.current = null;
      }, 450);
      return;
    }

    setFooterState("confirming");
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current);
    }
    confirmTimeoutRef.current = window.setTimeout(() => {
      setFooterState("idle");
      confirmTimeoutRef.current = null;
    }, 3000);
  }

  function handleFooterTransitionEnd(event: TransitionEvent<HTMLElement>) {
    if (!isFooterClosing || event.target !== event.currentTarget) {
      return;
    }

    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    localStorage.setItem("footer_dismissed", "true");
    setFooterDismissed(true);
    setFooterState("idle");
  }

  useEffect(() => {
    const currentHour = new Date().getHours();
    const cached = localStorage.getItem("greeting_cache");

    if (cached) {
      const cachedData: CachedGreeting = JSON.parse(cached);
      if (cachedData.hourGenerated === currentHour) {
        dispatchData({ type: "set_content", greeting: cachedData.greeting, quote: cachedData.quote });
        return;
      }
    }

    const newGreeting = getTimeBasedGreeting();
    const newQuote = getRandomQuote();
    dispatchData({ type: "set_content", greeting: newGreeting, quote: newQuote });

    localStorage.setItem(
      "greeting_cache",
      JSON.stringify({
        greeting: newGreeting,
        quote: newQuote,
        hourGenerated: currentHour,
      }),
    );
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [sessions, stats] = await Promise.all([getRecentSessions(3), getAllStats()]);
      if (!mounted) {
        return;
      }
      dispatchData({
        type: "set_data",
        recentSessions: sessions,
        weakTopics: stats.filter((stat) => stat.ewma_accuracy < 0.5 && stat.attempts >= 3).slice(0, 3),
      });
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

      {showOfflineNudge && (
        <div className="offline-nudge mb-8">
          <div className="offline-nudge__body">
            <p className="offline-nudge__title">Download images for full offline use</p>
            <p className="offline-nudge__desc">
              Question images aren't cached yet — download them once in Settings to use the app without a connection.
            </p>
          </div>
          <div className="offline-nudge__actions">
            <button
              type="button"
              className="offline-nudge__dismiss"
              onClick={() => {
                localStorage.setItem("offline_nudge_dismissed", "true");
                setShowOfflineNudge(false);
              }}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="offline-nudge__cta"
              onClick={() => {
                localStorage.setItem("offline_nudge_dismissed", "true");
                setShowOfflineNudge(false);
                navigate("/settings", { state: { highlight: "offline" } });
              }}
            >
              Go to Settings
            </button>
          </div>
        </div>
      )}

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

      {!footerDismissed && (
      <footer
        className={`page-footer ${isFooterClosing ? "page-footer--closing" : ""}`}
        onTransitionEnd={handleFooterTransitionEnd}
      >
        <p className="page-footer-text">
          This website is an independent educational resource and is not affiliated with, endorsed by, or sponsored by{" "}
          <a
            href="https://www.uat-uk.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="page-footer-link"
          >
            UAT-UK
          </a>
          ,{" "}
          <a
            href="https://www.pearsonvue.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="page-footer-link"
          >
            Pearson VUE
          </a>
          , the{" "}
          <a
            href="https://www.cam.ac.uk/"
            target="_blank"
            rel="noopener noreferrer"
            className="page-footer-link"
          >
            University of Cambridge
          </a>
          ,{" "}
          <a
            href="https://www.imperial.ac.uk/"
            target="_blank"
            rel="noopener noreferrer"
            className="page-footer-link"
          >
            Imperial College London
          </a>
          , or any other institution associated with the{" "}
          <a
            href="https://esat-tmua.ac.uk/about-the-tests/esat-test/"
            target="_blank"
            rel="noopener noreferrer"
            className="page-footer-link"
          >
            ESAT
          </a>
          . Questions are based on publicly available ENGAA and NSAA{" "}
          <a
            href="https://esat-tmua.ac.uk/esat-preparation-materials/"
            target="_blank"
            rel="noopener noreferrer"
            className="page-footer-link"
          >
            past papers
          </a>
          . You can view the{" "}
          <a
            href="https://github.com/oJezler-git/esat-practice"
            target="_blank"
            rel="noopener noreferrer"
            className="page-footer-link"
          >
            source code
          </a>
          {" "}
          on GitHub.
        </p>
        <button
          type="button"
          onClick={handleFooterClose}
          className={`page-footer-close ${isFooterConfirming ? "page-footer-close--confirming" : ""}`}
          aria-label={isFooterConfirming ? "Confirm close footer" : "Close footer"}
        >
          <span className="page-footer-close__icon" aria-hidden="true">
            ✕
          </span>
          <span className="page-footer-close__label" aria-hidden="true">
            Confirm
          </span>
        </button>
      </footer>
      )}
    </div>
  );
}
