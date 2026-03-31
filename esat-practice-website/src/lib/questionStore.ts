import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { Question } from "../types/schema";
import { getDb } from "./db";
import { getDedupedQuestions } from "./questionDedup";
import { ensureBundledQuestionsBootstrapped } from "./loader";

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

export function useQuestionStore() {
  const allQuestions = useQuestionStoreBase((state) => state.questions);
  const isLoading = useQuestionStoreBase((state) => state.isLoading);
  const loaded = useQuestionStoreBase((state) => state.loaded);
  const loadQuestions = useQuestionStoreBase((state) => state.loadQuestions);
  const getQuestionsByIds = useQuestionStoreBase((state) => state.getQuestionsByIds);

  useEffect(() => {
    if (!loaded && !isLoading) {
      void loadQuestions();
    }
  }, [isLoading, loadQuestions, loaded]);

  const questions = useMemo(
    () => getDedupedQuestions(allQuestions),
    [allQuestions],
  );

  const availableTopics = useMemo(() => {
    const topics = new Set<string>();
    questions.forEach((question) => {
      if (question.taxonomy.primary_topic) {
        topics.add(question.taxonomy.primary_topic);
      }
      question.taxonomy.secondary_topics.forEach((topic) => {
        if (topic) topics.add(topic);
      });
    });
    return [...topics].sort((a, b) => a.localeCompare(b));
  }, [questions]);

  const availableYears = useMemo(() => {
    const years = new Set<number>(questions.map((q) => q.source.year));
    return [...years].sort((a, b) => a - b);
  }, [questions]);

  return {
    allQuestions,
    questions,
    isLoading,
    loaded,
    loadQuestions,
    getQuestionsByIds,
    availableTopics,
    availableYears,
  };
}
