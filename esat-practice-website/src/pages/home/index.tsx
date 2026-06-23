import { useEffect, useRef, useState, type TransitionEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import { useStatsStore } from "../../lib/statsStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { getRandomQuote, getTimeBasedGreeting } from "../../lib/motivationalContent";
import { shuffle } from "../../lib/shuffle";
import type { Session, TopicStat } from "../../types/schema";


interface CachedGreeting {
  greeting: string;
  quote: string;
  hourGenerated: number;
}

export default function Home() {
  const navigate = useNavigate();
  const { questions, isLoading, loaded } = useQuestionStore();
  const { getRecentSessions, createSession } = useSessionStore();
  const { getAllStats } = useStatsStore();
  const settings = useSettingsStore((state) => state.settings);

  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [weakTopics, setWeakTopics] = useState<TopicStat[]>([]);
  const [greeting, setGreeting] = useState("");
  const [quote, setQuote] = useState("");
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
      const data: CachedGreeting = JSON.parse(cached);
      if (data.hourGenerated === currentHour) {
        setGreeting(data.greeting);
        setQuote(data.quote);
        return;
      }
    }

    const newGreeting = getTimeBasedGreeting();
    const newQuote = getRandomQuote();
    setGreeting(newGreeting);
    setQuote(newQuote);

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
          className="quickstart-beam col-span-2 py-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors text-lg disabled:bg-indigo-300 disabled:cursor-not-allowed"
        >
          {isQuestionBankLoading
            ? "Loading question bank..."
            : "Quick start - 20 random questions"}
        </button>
        <Link
          to="/practice"
          className="py-3 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors card"
        >
          Custom session
        </Link>
        <Link
          to="/question-bank"
          className="py-3 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors card"
        >
          Browse questions
        </Link>
      </div>

      {weakTopics.length > 0 && (
        <section className="mb-8 card p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
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
        <section className="card p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
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
