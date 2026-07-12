import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  RevisionDocEntry,
  RevisionModuleSlug,
} from "../content/revision/types";

export type Confidence = "shaky" | "okay" | "solid";

export type RevisionTopicProgress = {
  /** Soft "scrolled to the end" flag, set automatically at ~90% scroll. */
  read: boolean;
  /** Explicit "mark as done" — only ever toggled by the user. */
  done: boolean;
  confidence: Confidence | null;
  /** 0–100, the running MAX scroll depth ever reached for this topic. */
  scrollPct: number;
  firstVisited: number | null;
  lastVisited: number | null;
};

/** The threshold at which passive scrolling flips the soft `read` flag. */
export const READ_THRESHOLD = 90;

export const DEFAULT_TOPIC: RevisionTopicProgress = {
  read: false,
  done: false,
  confidence: null,
  scrollPct: 0,
  firstVisited: null,
  lastVisited: null,
};

type RevisionProgressState = {
  topics: Record<string, RevisionTopicProgress>;
  recordVisit: (docId: string) => void;
  recordScroll: (docId: string, pct: number) => void;
  markDone: (docId: string, done: boolean) => void;
  setConfidence: (docId: string, confidence: Confidence | null) => void;
  reset: () => void;
};

function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/** Returns the existing record for a docId, or a fresh default clone. */
function topicOf(
  topics: Record<string, RevisionTopicProgress>,
  docId: string,
): RevisionTopicProgress {
  return topics[docId] ?? { ...DEFAULT_TOPIC };
}

export const useRevisionProgress = create<RevisionProgressState>()(
  persist(
    (set) => ({
      topics: {},

      recordVisit: (docId) =>
        set((state) => {
          const prev = topicOf(state.topics, docId);
          const now = Date.now();
          return {
            topics: {
              ...state.topics,
              [docId]: {
                ...prev,
                firstVisited: prev.firstVisited ?? now,
                lastVisited: now,
              },
            },
          };
        }),

      recordScroll: (docId, pct) =>
        set((state) => {
          const prev = topicOf(state.topics, docId);
          const next = Math.max(prev.scrollPct, clampPct(pct));
          // Skip the write if nothing actually changed — avoids churning the
          // persisted blob on every scroll frame once the max is reached.
          if (next === prev.scrollPct && (prev.read || next < READ_THRESHOLD)) {
            return state;
          }
          return {
            topics: {
              ...state.topics,
              [docId]: {
                ...prev,
                scrollPct: next,
                read: prev.read || next >= READ_THRESHOLD,
              },
            },
          };
        }),

      markDone: (docId, done) =>
        set((state) => ({
          topics: {
            ...state.topics,
            [docId]: { ...topicOf(state.topics, docId), done },
          },
        })),

      setConfidence: (docId, confidence) =>
        set((state) => ({
          topics: {
            ...state.topics,
            [docId]: { ...topicOf(state.topics, docId), confidence },
          },
        })),

      reset: () => set({ topics: {} }),
    }),
    {
      name: "esat-revision-progress",
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | Partial<RevisionProgressState>
          | undefined;
        return {
          ...currentState,
          ...persisted,
          topics: persisted?.topics ?? {},
        };
      },
    },
  ),
);

// --- Derived selectors (pure, unit-testable without React) -----------------

export type ModuleSummary = {
  total: number;
  done: number;
  read: number;
  /** Percentage of the module's topics explicitly marked done (0–100). */
  pct: number;
};

export function moduleSummary(
  topics: Record<string, RevisionTopicProgress>,
  moduleDocs: RevisionDocEntry[],
): ModuleSummary {
  const total = moduleDocs.length;
  let done = 0;
  let read = 0;
  for (const doc of moduleDocs) {
    const t = topics[doc.id];
    if (!t) continue;
    if (t.done) done += 1;
    if (t.read) read += 1;
  }
  return {
    total,
    done,
    read,
    pct: total === 0 ? 0 : (done / total) * 100,
  };
}

/**
 * The most recently visited topics, newest first, limited to `limit`.
 * Topics that have never been visited (no `lastVisited`) are excluded.
 */
export function recentTopics(
  topics: Record<string, RevisionTopicProgress>,
  allDocs: RevisionDocEntry[],
  limit = 3,
): RevisionDocEntry[] {
  return allDocs
    .filter((doc) => topics[doc.id]?.lastVisited != null)
    .sort(
      (a, b) =>
        (topics[b.id]!.lastVisited ?? 0) - (topics[a.id]!.lastVisited ?? 0),
    )
    .slice(0, limit);
}

// --- Thin React hooks ------------------------------------------------------

export function useTopicProgress(docId: string): RevisionTopicProgress {
  return useRevisionProgress((state) => state.topics[docId] ?? DEFAULT_TOPIC);
}

export function useModuleSummary(
  moduleDocs: RevisionDocEntry[],
): ModuleSummary {
  const topics = useRevisionProgress((state) => state.topics);
  return moduleSummary(topics, moduleDocs);
}

export function useRecentTopics(
  allDocs: RevisionDocEntry[],
  limit = 3,
): RevisionDocEntry[] {
  const topics = useRevisionProgress((state) => state.topics);
  return recentTopics(topics, allDocs, limit);
}

export type { RevisionModuleSlug };
