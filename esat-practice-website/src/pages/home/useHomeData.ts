import { useEffect, useReducer } from "react";
import { useSessionStore } from "../../lib/sessionStore";
import { useStatsStore } from "../../lib/statsStore";
import { getRandomQuote, getTimeBasedGreeting } from "../../lib/motivationalContent";
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

/** Loads the cached-per-hour greeting/quote and the recent-sessions/weak-topics summary. */
export function useHomeData() {
  const { getRecentSessions } = useSessionStore();
  const { getAllStats } = useStatsStore();

  const [homeData, dispatchData] = useReducer(homeDataReducer, { recentSessions: [], weakTopics: [], greeting: "", quote: "" });

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

  return homeData;
}
