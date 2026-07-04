import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../../lib/sessionStore";
import { useStatsStore } from "../../lib/statsStore";
import type { Session, SessionSummary } from "../../types/schema";

export interface SessionRow {
  session: Session;
  summary: SessionSummary | null;
}

export function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

export function useHistoryData() {
  const { getAllSessions } = useSessionStore();
  const { getSessionSummaries } = useStatsStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [loadedSessions, loadedSummaries] = await Promise.all([
        getAllSessions(),
        getSessionSummaries(),
      ]);
      if (!mounted) return;
      setSessions(loadedSessions);
      setSummaries(loadedSummaries);
      setIsLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [getAllSessions, getSessionSummaries]);

  const summaryMap = useMemo(
    () => new Map(summaries.map((s) => [s.session_id, s])),
    [summaries],
  );

  const rows: SessionRow[] = useMemo(
    () =>
      sessions.map((session) => ({
        session,
        summary: summaryMap.get(session.id) ?? null,
      })),
    [sessions, summaryMap],
  );

  // Heatmap: date → questions answered that day
  const heatmapData = useMemo(() => {
    const map = new Map<string, number>();
    for (const { session, summary } of rows) {
      if (session.state !== "completed" || !summary) continue;
      const date = toDateStr(session.completed_at ?? session.created_at);
      map.set(date, (map.get(date) ?? 0) + summary.attempts);
    }
    return map;
  }, [rows]);

  // 26-week grid starting from the Monday 25 full weeks ago
  const heatmapGrid = useMemo(() => {
    const today = new Date();
    const thisMonday = getMondayOfWeek(today);
    const gridStart = new Date(thisMonday);
    gridStart.setDate(gridStart.getDate() - 25 * 7);

    const weeks: { date: string; ts: number }[][] = [];
    const cursor = new Date(gridStart);
    for (let w = 0; w < 26; w++) {
      const week: { date: string; ts: number }[] = [];
      for (let d = 0; d < 7; d++) {
        week.push({ date: toDateStr(cursor.getTime()), ts: cursor.getTime() });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, []);

  // Month label positions derived from grid
  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (let wi = 0; wi < heatmapGrid.length; wi++) {
      const firstDay = new Date(heatmapGrid[wi][0].ts);
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        labels.push({
          label: firstDay.toLocaleDateString("en-GB", { month: "short" }),
          col: wi,
        });
        lastMonth = month;
      }
    }
    return labels;
  }, [heatmapGrid]);

  // Streak calculation
  const { currentStreak, bestStreak } = useMemo(() => {
    const activeDates = new Set(
      rows.flatMap((r) =>
        r.session.state === "completed" && r.session.completed_at
          ? [toDateStr(r.session.completed_at)]
          : [],
      ),
    );

    // Current streak: count backward from today
    let streak = 0;
    const c = new Date();
    c.setHours(12, 0, 0, 0);
    while (activeDates.has(toDateStr(c.getTime()))) {
      streak++;
      c.setDate(c.getDate() - 1);
    }

    // Best streak
    const sorted = [...activeDates].sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sorted) {
      if (prev === null) {
        run = 1;
      } else {
        const gap = Math.round(
          (new Date(d + "T12:00:00").getTime() -
            new Date(prev + "T12:00:00").getTime()) /
            86400000,
        );
        run = gap === 1 ? run + 1 : 1;
      }
      best = Math.max(best, run);
      prev = d;
    }

    return { currentStreak: streak, bestStreak: best };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!selectedDate) return rows;
    return rows.filter(({ session }) => {
      const ts = session.completed_at ?? session.created_at;
      return toDateStr(ts) === selectedDate;
    });
  }, [rows, selectedDate]);

  const completedCount = useMemo(
    () => rows.filter((r) => r.session.state === "completed").length,
    [rows],
  );
  const totalQuestions = useMemo(
    () => summaries.reduce((sum, s) => sum + s.attempts, 0),
    [summaries],
  );

  return {
    isLoading,
    sessions,
    heatmapData,
    heatmapGrid,
    monthLabels,
    currentStreak,
    bestStreak,
    filteredRows,
    completedCount,
    totalQuestions,
    selectedDate,
    setSelectedDate,
  };
}
