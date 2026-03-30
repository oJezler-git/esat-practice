import {
  buildModelAPrompt,
  MODEL_A_SYSTEM_PROMPT,
} from "../prompts";
import {
  callAnthropic,
  parseClassificationResponse,
} from "../classifier";
import { ClassificationResult } from "../types";
import { SONNET_MODEL } from "./constants";
import { buildFallbackResult, mergeQuestionAndResult } from "./helpers";
import { Stage1Params } from "./types";

/**
 * Runs the first-pass classifier in batches and fills the shared result map.
 * We treat parse failures as recoverable for a batch (fallback + trace) so one
 * bad model response does not abort the whole paper.
 *
 * @param {Stage1Params} params Stage 1 execution context and mutable result containers.
 * @returns {Promise<void>} Completes when all Stage 1 batches are processed.
 */
export async function runStage1Batches({
  batches,
  threshold,
  apiKey,
  resultById,
  escalationQueue,
  onProgress,
  onTrace,
}: Stage1Params): Promise<void> {
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const prompt = buildModelAPrompt(batch);
    let rawResponse = "";
    let parsed: ClassificationResult[] = [];
    let parseError: string | undefined;

    onTrace?.({
      timestamp: new Date().toISOString(),
      stage: "system",
      model: "none",
      question_ids: batch.map((question) => question.id),
      prompt: "",
      raw_response: "",
      parsed_count: 0,
      batch_index: batchIndex + 1,
      batch_total: batches.length,
      note: `Dispatching Stage 1 request ${batchIndex + 1}/${batches.length}.`,
    });

    onProgress(
      batchIndex,
      batches.length,
      `Stage 1 batches: waiting on ${batchIndex + 1}/${batches.length}`,
    );

    try {
      rawResponse = await callAnthropic(
        SONNET_MODEL,
        MODEL_A_SYSTEM_PROMPT,
        prompt,
        apiKey,
      );
    } catch (error) {
      onTrace?.({
        timestamp: new Date().toISOString(),
        stage: "stage1",
        model: "sonnet",
        question_ids: batch.map((question) => question.id),
        prompt,
        raw_response: rawResponse,
        parsed_count: 0,
        batch_index: batchIndex + 1,
        batch_total: batches.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    try {
      parsed = parseClassificationResponse(rawResponse);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
      parsed = [];
    }

    const parsedById = new Map(parsed.map((item) => [item.question_id, item]));
    const batchEscalations: string[] = [];

    for (const question of batch) {
      const parsedResult = parsedById.get(question.id);
      const normalized = parsedResult
        ? mergeQuestionAndResult(question, parsedResult, "sonnet", false)
        : buildFallbackResult(question, "sonnet");

      resultById.set(question.id, normalized);
      if (normalized.uncertainty_score > threshold) {
        escalationQueue.push(question.id);
        batchEscalations.push(question.id);
      }
    }

    onTrace?.({
      timestamp: new Date().toISOString(),
      stage: "stage1",
      model: "sonnet",
      question_ids: batch.map((question) => question.id),
      prompt,
      raw_response: rawResponse,
      parsed_count: parsed.length,
      batch_index: batchIndex + 1,
      batch_total: batches.length,
      escalated_ids: batchEscalations,
      error: parseError,
    });

    onProgress(batchIndex + 1, batches.length, "Stage 1 batches");
  }
}
