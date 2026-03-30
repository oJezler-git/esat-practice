export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Numeric coercion with a predictable fallback.
 * Useful when model output may be numbers, numeric strings, or junk.
 *
 * @param {unknown} input Value to coerce.
 * @param {number} [fallback=0] Fallback used when coercion fails.
 * @returns {number} Finite numeric value.
 */
export function toFiniteNumber(input: unknown, fallback = 0): number {
  const parsed =
    typeof input === "number" ? input : Number.parseFloat(String(input ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * One-stop "coerce then bound" helper used in normalization paths.
 *
 * @param {unknown} input Value to coerce.
 * @param {number} min Lower bound (inclusive).
 * @param {number} max Upper bound (inclusive).
 * @param {number} fallback Value to use when coercion fails.
 * @returns {number} Coerced value clamped to the provided range.
 */
export function clampToRange(
  input: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return clamp(toFiniteNumber(input, fallback), min, max);
}

export function asStringOrFallback(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

/**
 * Returns a trimmed string or `null` when value is missing/blank.
 * This avoids treating whitespace-only values as meaningful data.
 *
 * @param {unknown} input Value to normalize.
 * @returns {string | null} Trimmed string or `null` when empty/invalid.
 */
export function asTrimmedNonEmptyString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

/**
 * Keeps only string values from untrusted array-like input.
 *
 * @param {unknown} input Candidate array value.
 * @returns {string[]} String-only array.
 */
export function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => typeof value === "string");
}

/**
 * Lightweight runtime object guard for parsing code.
 *
 * @param {unknown} value Value to check.
 * @returns {value is Record<string, unknown>} True when value is a non-null object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
