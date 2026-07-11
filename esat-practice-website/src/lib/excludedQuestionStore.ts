import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { ExcludedQuestion, Question } from "../types/schema";
import { getDb } from "./db";
import { analyseNsaaDuplicates } from "./questionDedup";

function sortExcludedQuestions(
  left: ExcludedQuestion,
  right: ExcludedQuestion,
): number {
  return right.excluded_at - left.excluded_at;
}

export async function listExcludedQuestionsFromDb(): Promise<ExcludedQuestion[]> {
  const database = await getDb();
  const excludedQuestions = await database.getAll("excludedQuestions");
  return excludedQuestions.sort(sortExcludedQuestions);
}

export async function getExcludedQuestionIdsFromDb(): Promise<Set<string>> {
  const excludedQuestions = await listExcludedQuestionsFromDb();
  return new Set(
    excludedQuestions.map((excludedQuestion) => excludedQuestion.question_id),
  );
}

export async function excludeQuestionInDb(questionId: string): Promise<void> {
  const database = await getDb();
  await database.put("excludedQuestions", {
    question_id: questionId,
    excluded_at: Date.now(),
  });
}

export async function includeQuestionInDb(questionId: string): Promise<void> {
  const database = await getDb();
  await database.delete("excludedQuestions", questionId);
}

interface ExcludedQuestionStoreState {
  excludedQuestions: ExcludedQuestion[];
  isLoading: boolean;
  loaded: boolean;
  loadExcludedQuestions: () => Promise<void>;
  excludeQuestion: (questionId: string, allQuestions?: Question[]) => Promise<void>;
  includeQuestion: (questionId: string, allQuestions?: Question[]) => Promise<void>;
}

const useExcludedQuestionStoreBase = create<ExcludedQuestionStoreState>(
  (set) => ({
    excludedQuestions: [],
    isLoading: false,
    loaded: false,
    loadExcludedQuestions: async () => {
      set({ isLoading: true });
      try {
        const excludedQuestions = await listExcludedQuestionsFromDb();
        set({
          excludedQuestions,
          loaded: true,
        });
      } finally {
        set({ isLoading: false });
      }
    },
    excludeQuestion: async (questionId: string, allQuestions?: Question[]) => {
      const idsToExclude = [questionId];
      if (allQuestions) {
        const analysis = analyseNsaaDuplicates(allQuestions);
        for (const pair of analysis.excludedPairs) {
          if (pair.engaaQuestion.id === questionId) {
            idsToExclude.push(pair.nsaaQuestion.id);
          } else if (pair.nsaaQuestion.id === questionId) {
            idsToExclude.push(pair.engaaQuestion.id);
          }
        }
      }

      await Promise.all(idsToExclude.map((id) => excludeQuestionInDb(id)));
      const excludedQuestions = await listExcludedQuestionsFromDb();
      set({
        excludedQuestions,
        loaded: true,
      });
    },
    includeQuestion: async (questionId: string, allQuestions?: Question[]) => {
      const idsToInclude = [questionId];
      if (allQuestions) {
        const analysis = analyseNsaaDuplicates(allQuestions);
        for (const pair of analysis.excludedPairs) {
          if (pair.engaaQuestion.id === questionId) {
            idsToInclude.push(pair.nsaaQuestion.id);
          } else if (pair.nsaaQuestion.id === questionId) {
            idsToInclude.push(pair.engaaQuestion.id);
          }
        }
      }

      await Promise.all(idsToInclude.map((id) => includeQuestionInDb(id)));
      const excludedQuestions = await listExcludedQuestionsFromDb();
      set({
        excludedQuestions,
        loaded: true,
      });
    },
  }),
);

/**
 * Re-reads exclusions from the database into the in-memory store. Callers
 * that write exclusions outside the store's own actions (e.g. the session
 * slice's exclude-current-question path) must call this afterwards, or pages
 * that consume the store keep serving the excluded question until a reload.
 */
export async function refreshExcludedQuestionsStore(): Promise<void> {
  const excludedQuestions = await listExcludedQuestionsFromDb();
  useExcludedQuestionStoreBase.setState({ excludedQuestions, loaded: true });
}

export function useExcludedQuestionStore() {
  const excludedQuestions = useExcludedQuestionStoreBase(
    (state) => state.excludedQuestions,
  );
  const isLoading = useExcludedQuestionStoreBase((state) => state.isLoading);
  const loaded = useExcludedQuestionStoreBase((state) => state.loaded);
  const loadExcludedQuestions = useExcludedQuestionStoreBase(
    (state) => state.loadExcludedQuestions,
  );
  const excludeQuestion = useExcludedQuestionStoreBase(
    (state) => state.excludeQuestion,
  );
  const includeQuestion = useExcludedQuestionStoreBase(
    (state) => state.includeQuestion,
  );

  useEffect(() => {
    if (!loaded && !isLoading) {
      void loadExcludedQuestions();
    }
  }, [isLoading, loadExcludedQuestions, loaded]);

  const excludedQuestionIds = useMemo(
    () =>
      new Set(
        excludedQuestions.map((excludedQuestion) => excludedQuestion.question_id),
      ),
    [excludedQuestions],
  );

  return {
    excludedQuestions,
    excludedQuestionIds,
    isLoading,
    loaded,
    loadExcludedQuestions,
    excludeQuestion,
    includeQuestion,
  };
}
