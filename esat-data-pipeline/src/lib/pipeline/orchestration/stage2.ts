import {
  buildModelBPrompt,
  MODEL_B_SYSTEM_PROMPT,
} from "../prompts";
import {
  callAnthropic,
  parseClassificationResponse,
} from "../classifier";
import { ClassificationResult } from "../types";
import { OPUS_MODEL } from "./constants";
import { buildFallbackResult, mergeQuestionAndResult } from "./helpers";
import { Stage2Params } from "./types";

/**
 * Re-runs only uncertain questions through the reviewer model.
 * This stage is intentionally sequential today; it simplifies tracing/rate-limit
 * behaviour and keeps review prompts deterministic.
 *
 * @param {Stage2Params} params Stage 2 execution context and shared maps.
 * @returns {Promise<void>} Completes when all escalated questions are reviewed.
 */
export async function runStage2Escalations({
  escalationQueue,
  questionById,
  resultById,
  apiKey,
  onProgress,
  onTrace,
}: Stage2Params): Promise<void> {
  if (escalationQueue.length === 0) {
    onTrace?.({
      timestamp: new Date().toISOString(),
      stage: "system",
      model: "none",
      question_ids: [],
      prompt: "",
      raw_response: "",
      parsed_count: 0,
      note: "No Stage 2 escalations were required.",
    });
    onProgress(0, 0, "Stage 2 escalations");
    return;
  }

  for (let i = 0; i < escalationQueue.length; i += 1) {
    const questionId = escalationQueue[i];
    const question = questionById.get(questionId);
    const current = resultById.get(questionId);

    if (!question || !current) {
      continue;
    }

    const prompt = buildModelBPrompt(question, current);
    let rawResponse = "";
    let parsed: ClassificationResult[] = [];
    let parseError: string | undefined;

    onTrace?.({
      timestamp: new Date().toISOString(),
      stage: "system",
      model: "none",
      question_ids: [questionId],
      prompt: "",
      raw_response: "",
      parsed_count: 0,
      batch_index: i + 1,
      batch_total: escalationQueue.length,
      note: `Dispatching Stage 2 request ${i + 1}/${escalationQueue.length}.`,
    });

    onProgress(
      i,
      escalationQueue.length,
      `Stage 2 escalations: waiting on ${i + 1}/${escalationQueue.length}`,
    );

    try {
      rawResponse = await callAnthropic(
        OPUS_MODEL,
        MODEL_B_SYSTEM_PROMPT,
        prompt,
        apiKey,
      );
    } catch (error) {
      onTrace?.({
        timestamp: new Date().toISOString(),
        stage: "stage2",
        model: "opus",
        question_ids: [questionId],
        prompt,
        raw_response: rawResponse,
        parsed_count: 0,
        batch_index: i + 1,
        batch_total: escalationQueue.length,
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

    const first = parsed[0];

    const reviewed = first
      ? mergeQuestionAndResult(question, first, "opus", true)
      : buildFallbackResult(question, "opus");

    resultById.set(questionId, reviewed);
    onTrace?.({
      timestamp: new Date().toISOString(),
      stage: "stage2",
      model: "opus",
      question_ids: [questionId],
      prompt,
      raw_response: rawResponse,
      parsed_count: parsed.length,
      batch_index: i + 1,
      batch_total: escalationQueue.length,
      error: parseError,
    });
    onProgress(i + 1, escalationQueue.length, "Stage 2 escalations");
  }
}
