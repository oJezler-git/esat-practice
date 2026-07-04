import { useMemo, useReducer } from "react";
import type { NsaaDuplicateAnalysis } from "../../lib/questionDedup";
import type { Question } from "../../types/schema";

export type SortKey = "default" | "topic" | "year" | "accuracy";
export type QuestionScope = "practice" | "excluded";

type FilterState = {
  search: string;
  scope: QuestionScope;
  topicFilter: string[];
  yearFilter: number[];
  verifiedOnly: boolean;
  hideNsaaDuplicates: boolean;
  showDedupDebug: boolean;
  sortKey: SortKey;
  isDetailsOpen: boolean;
};

type FilterAction =
  | { type: "set_search"; value: string }
  | { type: "set_scope"; scope: QuestionScope }
  | { type: "toggle_topic"; topic: string }
  | { type: "toggle_year"; year: number }
  | { type: "set_verified_only"; value: boolean }
  | { type: "set_hide_dupes"; value: boolean }
  | { type: "set_debug"; value: boolean }
  | { type: "set_sort"; key: SortKey }
  | { type: "set_details_open"; value: boolean };

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "set_search": return { ...state, search: action.value };
    case "set_scope": return { ...state, scope: action.scope };
    case "toggle_topic": {
      const topics = state.topicFilter.includes(action.topic)
        ? state.topicFilter.filter((t) => t !== action.topic)
        : [...state.topicFilter, action.topic];
      return { ...state, topicFilter: topics };
    }
    case "toggle_year": {
      const years = state.yearFilter.includes(action.year)
        ? state.yearFilter.filter((y) => y !== action.year)
        : [...state.yearFilter, action.year];
      return { ...state, yearFilter: years };
    }
    case "set_verified_only": return { ...state, verifiedOnly: action.value };
    case "set_hide_dupes": return { ...state, hideNsaaDuplicates: action.value };
    case "set_debug": return { ...state, showDedupDebug: action.value };
    case "set_sort": return { ...state, sortKey: action.key };
    case "set_details_open": return { ...state, isDetailsOpen: action.value };
    default: return state;
  }
}

export type CountItem = { label: string; count: number };

export interface DataDump {
  totalQuestions: number;
  verifiedQuestions: number;
  unverifiedQuestions: number;
  questionsWithImage: number;
  questionsWithoutImage: number;
  byPrimaryTopic: CountItem[];
  bySecondaryTopic: CountItem[];
  byYear: CountItem[];
  bySubject: CountItem[];
  byPaper: CountItem[];
  byPart: CountItem[];
  byCorrectAnswer: CountItem[];
  byModel: CountItem[];
}
// Stable empty-set fallback so the `visibleQuestions` memo below keeps a
// constant dependency identity when no duplicate analysis is available.
const EMPTY_NSAA_IDS: ReadonlySet<string> = new Set();

function buildCountItems(
  values: Array<string | number | null | undefined>,
): CountItem[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (value === null || value === undefined) {
      return;
    }
    const label = String(value).trim();
    if (!label) {
      return;
    }
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
}

interface Args {
  fullPracticeBank: Question[];
  excludedQuestions: Question[];
  nsaaDuplicateAnalysis: NsaaDuplicateAnalysis;
  initialTopicFilter: string[];
}

/** Owns search/topic/year/sort filter state and the derived question lists and data-dump stats. */
export function useQuestionBankFilters({ fullPracticeBank, excludedQuestions, nsaaDuplicateAnalysis, initialTopicFilter }: Args) {
  const [filterState, dispatchFilter] = useReducer(filterReducer, {
    search: "",
    scope: "practice",
    topicFilter: initialTopicFilter,
    yearFilter: [],
    verifiedOnly: false,
    hideNsaaDuplicates: true,
    showDedupDebug: false,
    sortKey: "default",
    isDetailsOpen: false,
  });
  const { search, scope, topicFilter, yearFilter, verifiedOnly, hideNsaaDuplicates, showDedupDebug, sortKey, isDetailsOpen } = filterState;

  const duplicateAnalysis = nsaaDuplicateAnalysis;
  const nsaaDuplicateIds = duplicateAnalysis?.hiddenNsaaIds ?? EMPTY_NSAA_IDS;
  const sourceQuestions = scope === "excluded" ? excludedQuestions : fullPracticeBank;

  const visibleQuestions = useMemo(
    () =>
      hideNsaaDuplicates
        ? sourceQuestions.filter((question) => !nsaaDuplicateIds.has(question.id))
        : sourceQuestions,
    [hideNsaaDuplicates, nsaaDuplicateIds, sourceQuestions],
  );
  const hiddenNsaaDuplicateCount = nsaaDuplicateIds.size;

  const dataDump = useMemo(() => {
    if (!isDetailsOpen) return null;

    const verified = sourceQuestions.filter(
      (question) => question.answer.verified,
    ).length;
    const withImage = sourceQuestions.filter((question) =>
      Boolean(question.content.image_url ?? question.content.image_b64),
    ).length;

    const byPrimaryTopic = buildCountItems(
      sourceQuestions.map((question) => question.taxonomy.primary_topic),
    );
    const bySecondaryTopic = buildCountItems(
      sourceQuestions.flatMap((question) => question.taxonomy.secondary_topics),
    );
    const byYear = buildCountItems(
      sourceQuestions.map((question) => question.source.year),
    );
    const bySubject = buildCountItems(
      sourceQuestions.map((question) => question.source.subject),
    );
    const byPaper = buildCountItems(
      sourceQuestions.map(
        (question) => `${question.source.paper} (${question.source.year})`,
      ),
    );
    const byPart = buildCountItems(
      sourceQuestions.map((question) => question.source.part),
    );
    const byCorrectAnswer = buildCountItems(
      sourceQuestions.map((question) => question.answer.correct),
    );
    const byModel = buildCountItems(
      sourceQuestions.map((question) => question.taxonomy.model_used),
    );

    return {
      totalQuestions: sourceQuestions.length,
      verifiedQuestions: verified,
      unverifiedQuestions: Math.max(0, sourceQuestions.length - verified),
      questionsWithImage: withImage,
      questionsWithoutImage: Math.max(0, sourceQuestions.length - withImage),
      byPrimaryTopic,
      bySecondaryTopic,
      byYear,
      bySubject,
      byPaper,
      byPart,
      byCorrectAnswer,
      byModel,
    };
  }, [isDetailsOpen, sourceQuestions]);

  const filtered = useMemo(() => {
    let result = visibleQuestions;

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.content.text.toLowerCase().includes(term) ||
          item.taxonomy.primary_topic.toLowerCase().includes(term) ||
          item.source.paper.toLowerCase().includes(term),
      );
    }
    if (topicFilter.length > 0) {
      result = result.filter((item) =>
        topicFilter.includes(item.taxonomy.primary_topic),
      );
    }
    if (yearFilter.length > 0) {
      result = result.filter((item) => yearFilter.includes(item.source.year));
    }
    if (verifiedOnly) {
      result = result.filter((item) => item.answer.verified);
    }

    switch (sortKey) {
      case "topic":
        return [...result].sort((left, right) =>
          left.taxonomy.primary_topic.localeCompare(
            right.taxonomy.primary_topic,
          ),
        );
      case "year":
        return [...result].sort(
          (left, right) => right.source.year - left.source.year,
        );
      case "accuracy":
        return [...result].sort(
          (left, right) => right.meta.accuracy_rate - left.meta.accuracy_rate,
        );
      default:
        return result;
    }
  }, [search, sortKey, topicFilter, verifiedOnly, visibleQuestions, yearFilter]);

  return {
    search,
    scope,
    topicFilter,
    yearFilter,
    verifiedOnly,
    hideNsaaDuplicates,
    showDedupDebug,
    sortKey,
    isDetailsOpen,
    setSearch: (value: string) => dispatchFilter({ type: "set_search", value }),
    setScope: (scope: QuestionScope) => dispatchFilter({ type: "set_scope", scope }),
    toggleTopic: (topic: string) => dispatchFilter({ type: "toggle_topic", topic }),
    toggleYear: (year: number) => dispatchFilter({ type: "toggle_year", year }),
    setVerifiedOnly: (value: boolean) => dispatchFilter({ type: "set_verified_only", value }),
    setHideDupes: (value: boolean) => dispatchFilter({ type: "set_hide_dupes", value }),
    setDebug: (value: boolean) => dispatchFilter({ type: "set_debug", value }),
    setSort: (key: SortKey) => dispatchFilter({ type: "set_sort", key }),
    setDetailsOpen: (value: boolean) => dispatchFilter({ type: "set_details_open", value }),
    sourceQuestions,
    visibleQuestions,
    filtered,
    dataDump,
    hiddenNsaaDuplicateCount,
    duplicateAnalysis,
  };
}
