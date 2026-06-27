import type { SelfMarkResult } from "../types/schema";

/**
 * Coerces an unknown value into a {@link SelfMarkResult}. Accepts the canonical
 * string results and legacy boolean `correct` values (true/false) found in older
 * persisted attempt records. Anything else falls back to "skipped".
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
