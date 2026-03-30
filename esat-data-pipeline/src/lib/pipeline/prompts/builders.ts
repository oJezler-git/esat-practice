import { ClassificationResult, RawQuestion } from "../types";
import { JSON_OUTPUT_RULES } from "./constants";
import { serialiseFewShots, serialiseModelBFewShots } from "./few-shots";
import { serialiseTaxonomy } from "./taxonomy";

/**
 * Builds the Stage 1 prompt for batch classification.
 * We inline taxonomy + few-shots every time to keep requests self-contained,
 * which makes traces debuggable even when prompt assets change later.
 *
 * @param {RawQuestion[]} batch Questions to classify in this request.
 * @returns {string} Fully assembled Stage 1 prompt string.
 */
export function buildModelAPrompt(batch: RawQuestion[]): string {
  const questionsPayload = batch.map((question) => ({
    question_id: question.id,
    question_text: question.text,
  }));

  return [
    "ESAT taxonomy:",
    serialiseTaxonomy(),
    "",
    "Few-shot reference examples:",
    serialiseFewShots(),
    "",
    "Classification instructions:",
    "- Avoid shallow keyword triggers.",
    "- If uncertain between close topics, choose best primary_topic and place others in alternative_topics.",
    "- Set ambiguous=true when overlap is substantial or evidence is weak.",
    "",
    `Questions (${batch.length}):`,
    JSON.stringify(questionsPayload, null, 2),
    "",
    JSON_OUTPUT_RULES,
  ].join("\n");
}

/**
 * Builds the Stage 2 reviewer prompt for a single escalated question.
 * Includes Model A output verbatim so reviewers can either confirm or correct it.
 *
 * @param {RawQuestion} question Source question.
 * @param {ClassificationResult} modelAResult Stage 1 result to review/correct.
 * @returns {string} Fully assembled Stage 2 prompt string.
 */
export function buildModelBPrompt(
  question: RawQuestion,
  modelAResult: ClassificationResult,
): string {
  const inputPayload = {
    question: {
      question_id: question.id,
      question_text: question.text,
    },
    model_a_result: {
      question_id: modelAResult.question_id,
      primary_topic: modelAResult.primary_topic,
      secondary_topics: modelAResult.secondary_topics,
      alternative_topics: modelAResult.alternative_topics,
      confidence: modelAResult.confidence,
      ambiguous: modelAResult.ambiguous,
      uncertainty_score: modelAResult.uncertainty_score,
    },
  };

  return [
    "ESAT taxonomy:",
    serialiseTaxonomy(),
    "",
    "Example corrections:",
    serialiseModelBFewShots(),
    "",
    "Task:",
    "Confirm or correct Model A classification. If corrected, provide better primary_topic and adjusted secondary/alternative topics.",
    "Use uncertainty_score (0 to 1) as a signal that Model A was uncertain; higher means stronger need to re-evaluate.",
    "",
    "Input:",
    JSON.stringify(inputPayload, null, 2),
    "",
    JSON_OUTPUT_RULES,
  ].join("\n");
}
