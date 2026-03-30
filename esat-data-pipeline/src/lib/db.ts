import Dexie, { type Table } from "dexie";
import { Question } from "./question-segmenter";
import { ClassificationResult } from "./pipeline/types";
import {
  asStringOrFallback,
  asTrimmedNonEmptyString,
  clampToRange,
  toStringArray,
} from "./pipeline/normalise";

export type StudyStatus = "unseen" | "correct" | "incorrect" | "flagged";

// Combined shape we actually use in the app after classification
export interface ClassifiedQuestion extends Question, ClassificationResult {}

// What gets persisted locally (adds paper + study state)
export interface StoredQuestion extends ClassifiedQuestion {
  paperId: string;
  status: StudyStatus;
  correctAnswer?: string;
}

export interface PaperMetadata {
  id: string;
  name: string;
  year?: number;
  dateAdded: number;
  questionCount: number;
  isClassified: boolean;
  hasAnswers?: boolean;
}

// Input can be partially classified depending on pipeline stage
type SaveableQuestion = Question &
  Partial<ClassificationResult> & { status?: StudyStatus };

/**
 * Coerces partially-classified records into a consistent shape before persistence.
 * This keeps the rest of the app free from repeated null/format guards when data
 * arrives from mixed sources (raw extraction, model output, manual edits).
 *
 * @param {SaveableQuestion} question Question row with optional/partial classification fields.
 * @returns {ClassificationResult} Normalized classification payload ready for storage.
 */
function normaliseClassification(
  question: SaveableQuestion,
): ClassificationResult {
  return {
    // fall back to original id if pipeline didn't supply one properly
    question_id: asTrimmedNonEmptyString(question.question_id) ?? question.id,

    // prefer processed text, but raw text is fine as a fallback
    question_text: asStringOrFallback(question.question_text, question.text),

    // default bucket avoids null checks everywhere else
    primary_topic:
      asTrimmedNonEmptyString(question.primary_topic) ?? "Unclassified",

    secondary_topics: toStringArray(question.secondary_topics),
    alternative_topics: toStringArray(question.alternative_topics),

    // clamp just in case model returns something weird
    confidence: clampToRange(question.confidence, 0, 1, 0),

    ambiguous: Boolean(question.ambiguous),

    // if missing, assume worst-case uncertainty
    uncertainty_score:
      typeof question.uncertainty_score === "number"
        ? clampToRange(question.uncertainty_score, 0, 1, 1)
        : 1,

    verified: Boolean(question.verified),

    // only allow known model labels
    model_used: question.model_used === "opus" ? "opus" : "sonnet",
  };
}

/**
 * IndexedDB schema wrapper for the local archive.
 * We intentionally keep this denormalised and lightweight; query patterns are
 * simple enough that readability beats clever schema tricks here.
 */
export class ESATDatabase extends Dexie {
  questions!: Table<StoredQuestion>;
  papers!: Table<PaperMetadata>;

  constructor() {
    super("ESATArchive");

    // might revisit indexing strategy if queries get slower
    this.version(2).stores({
      questions: "id, paperId, status, primary_topic, year",
      papers: "id, name, dateAdded",
    });
  }
}

export const db = new ESATDatabase();

/**
 * Stores paper metadata and all related questions atomically.
 * If anything fails midway, Dexie rolls back the transaction so the library
 * doesn't end up with orphaned papers or partial question sets.
 *
 * @param {string} paperId Stable paper identifier.
 * @param {SaveableQuestion[]} questions Questions to persist for this paper.
 * @param {Omit<PaperMetadata, "id" | "dateAdded" | "questionCount" | "isClassified">} metadata Paper-level metadata provided by the caller.
 * @returns {Promise<void>} Completes once the IndexedDB transaction commits.
 */
export async function saveProcessedPaper(
  paperId: string,
  questions: SaveableQuestion[],
  metadata: Omit<
    PaperMetadata,
    "id" | "dateAdded" | "questionCount" | "isClassified"
  >,
) {
  // normalise everything up front so DB stays clean
  const normalisedQuestions: StoredQuestion[] = questions.map((question) => ({
    ...question,
    ...normaliseClassification(question),
    paperId,
    status: question.status || "unseen", // default for new imports
  }));

  // quick heuristic: do we actually have meaningful classification?
  const isClassified = normalisedQuestions.some(
    (question) =>
      question.primary_topic && question.primary_topic !== "Unclassified",
  );

  // keep paper + questions in sync
  await db.transaction("rw", db.papers, db.questions, async () => {
    await db.papers.put({
      id: paperId,
      name: metadata.name,
      year: metadata.year,
      dateAdded: Date.now(),
      questionCount: normalisedQuestions.length,
      isClassified,
    });

    await db.questions.bulkPut(normalisedQuestions);
  });
}

/**
 * Hot-path status update during study sessions.
 * We patch only the `status` field to avoid re-writing full question records.
 *
 * @param {string} questionId Target question ID.
 * @param {StudyStatus} status New study status value.
 * @returns {Promise<void>} Resolves when the update is persisted.
 */
export async function updateQuestionStatus(
  questionId: string,
  status: StudyStatus,
) {
  await db.questions.update(questionId, { status });
}
