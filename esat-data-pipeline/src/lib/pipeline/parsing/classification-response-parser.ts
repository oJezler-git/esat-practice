import { ESAT_TOPIC_NAMES } from "../prompts/taxonomy";
import { ClassificationResult } from "../types";
import {
  asStringOrFallback,
  asTrimmedNonEmptyString,
  clampToRange,
  isRecord,
} from "../normalise";

function stripMarkdownFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractJsonCandidate(raw: string): string {
  const cleaned = stripMarkdownFences(raw);
  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    return cleaned;
  }

  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    return cleaned.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    return cleaned.slice(arrayStart, arrayEnd + 1);
  }

  return cleaned;
}

/**
 * Best-effort salvage path for truncated/malformed JSON.
 * We scan only inside the `results` array and extract complete object snippets.
 * It's heuristic, but it saves useful data when a response is cut off mid-stream.
 *
 * @param {string} rawText Raw model response text.
 * @returns {unknown[]} Recovered JSON objects that look like classification items.
 */
function recoverPartialResultObjects(rawText: string): unknown[] {
  const text = stripMarkdownFences(rawText);
  const resultsIdx = text.indexOf('"results"');
  if (resultsIdx === -1) return [];

  const arrayStart = text.indexOf("[", resultsIdx);
  if (arrayStart === -1) return [];

  const recovered: unknown[] = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let objectStart = -1;

  for (let i = arrayStart + 1; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) objectStart = i;
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth > 0) depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        const snippet = text.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(snippet);
          if (
            isRecord(parsed) &&
            (asTrimmedNonEmptyString(parsed.question_id) ||
              asTrimmedNonEmptyString(parsed.id))
          ) {
            recovered.push(parsed);
          }
        } catch {
          // Ignore malformed trailing snippets.
        }
        objectStart = -1;
      }
      continue;
    }

    if (ch === "]" && depth === 0) {
      break;
    }
  }

  return recovered;
}

function sanitiseTopicName(input: unknown): string {
  const candidate = asTrimmedNonEmptyString(input);
  if (!candidate) return "Unclassified";
  return ESAT_TOPIC_NAMES.includes(candidate) ? candidate : "Unclassified";
}

function sanitiseTopicList(input: unknown, primaryTopic: string): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) => sanitiseTopicName(item))
        .filter((topic) => topic !== "Unclassified" && topic !== primaryTopic),
    ),
  );
}

function normaliseClassificationItem(
  item: unknown,
): ClassificationResult | null {
  const source = isRecord(item) ? item : {};
  const questionId =
    asTrimmedNonEmptyString(source.question_id) ??
    asTrimmedNonEmptyString(source.id) ??
    "";

  if (!questionId) {
    return null;
  }

  const primaryTopic = sanitiseTopicName(source.primary_topic);

  return {
    question_id: questionId,
    question_text: asStringOrFallback(source.question_text),
    primary_topic: primaryTopic,
    secondary_topics: sanitiseTopicList(source.secondary_topics, primaryTopic),
    alternative_topics: sanitiseTopicList(
      source.alternative_topics,
      primaryTopic,
    ),
    confidence: clampToRange(source.confidence, 0, 1, 0),
    ambiguous: Boolean(source.ambiguous),
    uncertainty_score: 0,
    verified: false,
    model_used: "sonnet",
  };
}

function extractResultList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  if (Array.isArray(parsed.results)) {
    return parsed.results;
  }

  if (Array.isArray(parsed.questions)) {
    return parsed.questions;
  }

  return null;
}

/**
 * Normalises model output into strict `ClassificationResult` rows.
 * Accepts a few wrapper shapes (`results`, `questions`, bare array) because
 * real LLM responses can drift even with strict prompts.
 *
 * @param {string} rawText Raw model output, possibly wrapped in markdown fences.
 * @returns {ClassificationResult[]} Normalized classification records.
 */
export function parseClassificationResponse(
  rawText: string,
): ClassificationResult[] {
  const jsonCandidate = extractJsonCandidate(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    const recovered = recoverPartialResultObjects(rawText);
    if (recovered.length > 0) {
      const normalized: Array<ClassificationResult | null> = recovered.map(
        (item: unknown) => normaliseClassificationItem(item),
      );
      return normalized.filter(
        (item: ClassificationResult | null): item is ClassificationResult =>
          item !== null,
      );
    }
    throw new Error(
      `Failed to parse model JSON response: ${jsonCandidate.slice(0, 500)}`,
    );
  }

  const maybeList = extractResultList(parsed);

  if (!maybeList) {
    throw new Error("Parsed model response does not include a results array");
  }

  const normalized: Array<ClassificationResult | null> = maybeList.map(
    (item: unknown) => normaliseClassificationItem(item),
  );
  return normalized.filter(
    (item: ClassificationResult | null): item is ClassificationResult =>
      item !== null,
  );
}
