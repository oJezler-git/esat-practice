import {
  ClassificationResult,
  PipelineTraceEntry,
  RawQuestion,
} from "../types";
import { BATCH_SIZE } from "./constants";
import { buildFallbackResult, chunkQuestions } from "./helpers";
import { runStage1Batches } from "./stage1";
import { runStage2Escalations } from "./stage2";

/**
 * End-to-end topic-classification pipeline.
 *
 * Stage 1 runs fast/batched classification, then Stage 2 selectively re-checks
 * uncertain items with a stronger model. The function guarantees one output row
 * per input question, even when parsing/API calls degrade.
 *
 * @param {RawQuestion[]} questions Questions to classify.
 * @param {string} apiKey Anthropic API key.
 * @param {number} threshold Uncertainty threshold for Stage 2 escalation.
 * @param {(done: number, total: number, phase: string) => void} onProgress Progress callback for UI updates.
 * @param {(trace: PipelineTraceEntry) => void} [onTrace] Optional trace callback for debugging/auditing.
 * @returns {Promise<ClassificationResult[]>} Final classification results aligned with input order.
 */
export async function runPipeline(
  questions: RawQuestion[],
  apiKey: string,
  threshold: number,
  onProgress: (done: number, total: number, phase: string) => void,
  onTrace?: (trace: PipelineTraceEntry) => void,
): Promise<ClassificationResult[]> {
  if (!apiKey.trim()) {
    throw new Error("Anthropic API key is required");
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  const batches = chunkQuestions(questions, BATCH_SIZE);
  onTrace?.({
    timestamp: new Date().toISOString(),
    stage: "system",
    model: "none",
    question_ids: questions.map((question) => question.id),
    prompt: "",
    raw_response: "",
    parsed_count: 0,
    note: `Pipeline started for ${questions.length} questions across ${batches.length} Stage 1 batches.`,
  });
  onProgress(0, batches.length, "Stage 1 batches: preparing first request");

  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const resultById = new Map<string, ClassificationResult>();
  const escalationQueue: string[] = [];

  await runStage1Batches({
    batches,
    threshold,
    apiKey,
    resultById,
    escalationQueue,
    onProgress,
    onTrace,
  });

  if (escalationQueue.length > 0) {
    onTrace?.({
      timestamp: new Date().toISOString(),
      stage: "system",
      model: "none",
      question_ids: escalationQueue,
      prompt: "",
      raw_response: "",
      parsed_count: 0,
      note: `Stage 2 escalation queue prepared (${escalationQueue.length} questions).`,
    });
    onProgress(
      0,
      escalationQueue.length,
      "Stage 2 escalations: preparing first request",
    );
  }

  await runStage2Escalations({
    escalationQueue,
    questionById,
    resultById,
    apiKey,
    onProgress,
    onTrace,
  });

  return questions.map((question) => {
    const result = resultById.get(question.id);
    if (result) return result;
    return buildFallbackResult(question, "sonnet");
  });
}
