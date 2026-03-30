import { computeUncertaintyScore } from "../uncertainty";
import { ClassificationResult, RawQuestion } from "../types";

/**
 * Deterministic chunking so batch traces remain stable and repeatable.
 *
 * @param {RawQuestion[]} questions Ordered input questions.
 * @param {number} size Target chunk size.
 * @returns {RawQuestion[][]} Question batches preserving original order.
 */
export function chunkQuestions(
  questions: RawQuestion[],
  size: number,
): RawQuestion[][] {
  const chunks: RawQuestion[][] = [];
  for (let i = 0; i < questions.length; i += size) {
    chunks.push(questions.slice(i, i + size));
  }
  return chunks;
}

/**
 * Conservative fallback used when parsing/model output is missing.
 * We mark these as ambiguous/high-uncertainty so they naturally flow into review.
 *
 * @param {RawQuestion} question Source question used for identity/text fields.
 * @param {"sonnet" | "opus"} model Model label to stamp on the fallback result.
 * @returns {ClassificationResult} Fallback classification payload.
 */
export function buildFallbackResult(
  question: RawQuestion,
  model: "sonnet" | "opus",
): ClassificationResult {
  return {
    question_id: question.id,
    question_text: question.text,
    primary_topic: "Unclassified",
    secondary_topics: [],
    alternative_topics: [],
    confidence: 0,
    ambiguous: true,
    uncertainty_score: 1,
    verified: model === "opus",
    model_used: model,
  };
}

/**
 * Rebinds identity fields from source-of-truth question data, then recomputes
 * uncertainty so scores stay consistent after any post-parse coercion.
 *
 * @param {RawQuestion} question Source question metadata.
 * @param {ClassificationResult} result Parsed/reviewed classification payload.
 * @param {"sonnet" | "opus"} modelUsed Model label to persist.
 * @param {boolean} verified Whether this result was reviewer-verified.
 * @returns {ClassificationResult} Merged and uncertainty-recomputed result.
 */
export function mergeQuestionAndResult(
  question: RawQuestion,
  result: ClassificationResult,
  modelUsed: "sonnet" | "opus",
  verified: boolean,
): ClassificationResult {
  const merged: ClassificationResult = {
    ...result,
    question_id: question.id,
    question_text: question.text,
    model_used: modelUsed,
    verified,
  };
  merged.uncertainty_score = computeUncertaintyScore(merged);
  return merged;
}
