import type { AttemptResult, SelfMarkResult } from "../types/schema";

/**
 * Coerces an unknown value into a {@link SelfMarkResult}. Accepts the canonical
 * string results and legacy boolean `correct` values (true/false) found in older
 * persisted attempt records. Anything else — including an in-progress
 * "unanswered" — falls back to "skipped", which is how scoring treats a question
 * the user never marked.
 */
export function normalizeResult(value: unknown): SelfMarkResult {
  if (value === "correct" || value === "incorrect" || value === "skipped") {
    return value;
  }
  if (value === true) {
    return "correct";
  }
  if (value === false) {
    return "incorrect";
  }
  return "skipped";
}

/**
 * Like {@link normalizeResult}, but keeps the in-progress "unanswered" state
 * instead of collapsing it to "skipped". Use this while a session is live — when
 * reading attempts back or committing elapsed time — so that merely visiting a
 * question does not record a result the user never gave.
 */
export function normalizeAttemptResult(value: unknown): AttemptResult {
  if (value === "unanswered" || value === undefined || value === null) {
    return "unanswered";
  }
  return normalizeResult(value);
}
