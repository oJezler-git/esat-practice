import { useEffect } from "react";
import { create } from "zustand";
import type { Question } from "../types/schema";
import { getDb } from "./db";
import { useExcludedQuestionStore } from "./excludedQuestionStore";
import { analyseNsaaDuplicates, type NsaaDuplicateAnalysis } from "./questionDedup";
import { ensureBundledQuestionsBootstrapped } from "./loader";
import { resetLoadingProgress } from "./loadingProgress";

function sortQuestions(left: Question, right: Question): number {
  if (left.source.year !== right.source.year) {
    return left.source.year - right.source.year;
  }
  if (left.source.paper !== right.source.paper) {
    return left.source.paper.localeCompare(right.source.paper);
  }
  if (left.source.page !== right.source.page) {
    return left.source.page - right.source.page;
  }
  return left.id.localeCompare(right.id);
}

async function ensureQuestionSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = ensureBundledQuestionsBootstrapped().then(() => undefined);
  }
  await seedPromise;
}

let seedPromise: Promise<void> | null = null;

export async function listQuestionsFromDb(): Promise<Question[]> {
  await ensureQuestionSeeded();
  const database = await getDb();
  const questions = await database.getAll("questions");
  return questions.sort(sortQuestions);
}

export async function getQuestionsByIdsFromDb(
  questionIds: string[],
): Promise<Question[]> {
  if (questionIds.length === 0) {
    return [];
  }

  await ensureQuestionSeeded();
  const database = await getDb();
  const tx = database.transaction("questions", "readonly");
  const loaded = await Promise.all(
    questionIds.map((questionId) => tx.store.get(questionId)),
  );
  await tx.done;

  return loaded.filter((question): question is Question => Boolean(question));
}

interface QuestionStoreState {
  questions: Question[];
  isLoading: boolean;
  loaded: boolean;
  loadQuestions: () => Promise<void>;
  getQuestionsByIds: (questionIds: string[]) => Promise<Question[]>;
}

const useQuestionStoreBase = create<QuestionStoreState>((set) => ({
  questions: [],
  isLoading: false,
  loaded: false,
  loadQuestions: async () => {
    set({ isLoading: true });
    try {
      const questions = await listQuestionsFromDb();
      set({
        questions,
        loaded: true,
      });
      resetLoadingProgress();
    } finally {
      set({ isLoading: false });
    }
  },
  getQuestionsByIds: async (questionIds: string[]) => {
    const questions = await getQuestionsByIdsFromDb(questionIds);
    const order = new Map(questionIds.map((questionId, index) => [questionId, index]));
    return questions.sort(
      (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
    );
  },
}));

// Module-level cache for derived state
let lastAllQuestions: Question[] | null = null;
let lastExcludedIds: Set<string> | null = null;

interface DerivedStoreState {
  nsaaDuplicateAnalysis: NsaaDuplicateAnalysis;
  effectiveExcludedIds: Set<string>;
  questions: Question[];
  fullPracticeBank: Question[];
  excludedQuestions: Question[];
  availableTopics: string[];
  availableYears: number[];
}

let cachedDerivedState: DerivedStoreState | null = null;

function getDerivedStoreState(
  allQuestions: Question[],
  excludedQuestionIds: Set<string>,
): DerivedStoreState {
  if (
    cachedDerivedState &&
    lastAllQuestions === allQuestions &&
    lastExcludedIds === excludedQuestionIds
  ) {
    return cachedDerivedState;
  }

  const nsaaDuplicateAnalysis = analyseNsaaDuplicates(allQuestions);

  const ids = new Set(excludedQuestionIds);
  if (allQuestions.length > 0) {
    // Propagate exclusions across duplicate pairs
    let changed = true;
    while (changed) {
      changed = false;
      for (const pair of nsaaDuplicateAnalysis.excludedPairs) {
        if (ids.has(pair.engaaQuestion.id) && !ids.has(pair.nsaaQuestion.id)) {
          ids.add(pair.nsaaQuestion.id);
          changed = true;
        }
        if (ids.has(pair.nsaaQuestion.id) && !ids.has(pair.engaaQuestion.id)) {
          ids.add(pair.engaaQuestion.id);
          changed = true;
        }
      }
    }
  }

  const questionsList = allQuestions
    .filter((question) => !nsaaDuplicateAnalysis.hiddenNsaaIds.has(question.id))
    .filter((question) => !ids.has(question.id));

  const fullPracticeBank = allQuestions.filter((question) => !ids.has(question.id));
  const excludedQuestions = allQuestions.filter((question) => ids.has(question.id));

  const topics = new Set<string>();
  questionsList.forEach((question) => {
    if (question.taxonomy.primary_topic) {
      topics.add(question.taxonomy.primary_topic);
    }
    question.taxonomy.secondary_topics.forEach((topic) => {
      if (topic) topics.add(topic);
    });
  });
  const availableTopics = [...topics].sort((a, b) => a.localeCompare(b));

  const years = new Set<number>(questionsList.map((q) => q.source.year));
  const availableYears = [...years].sort((a, b) => a - b);

  const newState: DerivedStoreState = {
    nsaaDuplicateAnalysis,
    effectiveExcludedIds: ids,
    questions: questionsList,
    fullPracticeBank,
    excludedQuestions,
    availableTopics,
    availableYears,
  };

  lastAllQuestions = allQuestions;
  lastExcludedIds = excludedQuestionIds;
  cachedDerivedState = newState;

  return newState;
}

export function useQuestionStore() {
  const allQuestions = useQuestionStoreBase((state) => state.questions);
  const isLoading = useQuestionStoreBase((state) => state.isLoading);
  const loaded = useQuestionStoreBase((state) => state.loaded);
  const loadQuestions = useQuestionStoreBase((state) => state.loadQuestions);
  const getQuestionsByIds = useQuestionStoreBase((state) => state.getQuestionsByIds);
  const {
    excludedQuestions: excludedQuestionRecords,
    excludedQuestionIds,
    isLoading: areExcludedQuestionsLoading,
    loaded: areExcludedQuestionsLoaded,
    loadExcludedQuestions,
  } = useExcludedQuestionStore();

  useEffect(() => {
    if (!loaded && !isLoading) {
      void loadQuestions();
    }
  }, [isLoading, loadQuestions, loaded]);

  useEffect(() => {
    if (!areExcludedQuestionsLoaded && !areExcludedQuestionsLoading) {
      void loadExcludedQuestions();
    }
  }, [
    areExcludedQuestionsLoaded,
    areExcludedQuestionsLoading,
    loadExcludedQuestions,
  ]);

  const derived = getDerivedStoreState(allQuestions, excludedQuestionIds);

  return {
    allQuestions,
    nsaaDuplicateAnalysis: derived.nsaaDuplicateAnalysis,
    questions: derived.questions,
    fullPracticeBank: derived.fullPracticeBank,
    excludedQuestions: derived.excludedQuestions,
    excludedQuestionIds: derived.effectiveExcludedIds,
    excludedQuestionRecords,
    isLoading: isLoading || areExcludedQuestionsLoading,
    loaded: loaded && areExcludedQuestionsLoaded,
    loadQuestions,
    getQuestionsByIds,
    availableTopics: derived.availableTopics,
    availableYears: derived.availableYears,
  };
}
