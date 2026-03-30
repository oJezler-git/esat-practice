import { ClassificationResult } from "./types";

const W1_CONFIDENCE = 0.5;
const W2_ALTERNATIVES = 0.3;
const W3_AMBIGUITY = 0.2;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Heuristic uncertainty score used to decide Stage 2 escalation.
 * We intentionally mix confidence, alternatives, and ambiguity so "confident but
 * clearly conflicted" outputs still get re-checked.
 *
 * @param {ClassificationResult} result Classification payload to score.
 * @returns {number} Uncertainty score in the range [0, 1].
 */
export function computeUncertaintyScore(result: ClassificationResult): number {
  const confidenceTerm = 1 - clamp(result.confidence, 0, 1);
  const alternativeTopicsTerm = Math.min(
    (result.alternative_topics?.length ?? 0) / 3,
    1,
  );
  const ambiguityTerm = result.ambiguous ? 1 : 0;

  const score =
    W1_CONFIDENCE * confidenceTerm +
    W2_ALTERNATIVES * alternativeTopicsTerm +
    W3_AMBIGUITY * ambiguityTerm;

  return clamp(score, 0, 1);
}
