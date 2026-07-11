import { createHash } from "node:crypto";
import path from "node:path";

export interface QuestionPackManifest {
  id: string;
  path: string;
  question_count: number;
  years: number[];
  topics: string[];
  papers: string[];
  bytes: number;
}

export interface PackManifestEntry {
  manifest: QuestionPackManifest;
  contentHash: string;
}

type RecordLike = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null;
}

function inferYearFromText(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function extractQuestionMeta(rawQuestion: unknown): {
  year?: number;
  topic?: string;
  paper?: string;
} {
  if (!isRecord(rawQuestion)) {
    return {};
  }

  const source = isRecord(rawQuestion.source) ? rawQuestion.source : undefined;
  const taxonomy = isRecord(rawQuestion.classification)
    ? rawQuestion.classification
    : isRecord(rawQuestion.taxonomy)
      ? rawQuestion.taxonomy
      : undefined;
  const paper =
    asString(source?.paper) ?? asString(rawQuestion.paper) ?? asString(rawQuestion.source);
  const year =
    asNumber(source?.year) ??
    asNumber(rawQuestion.year) ??
    inferYearFromText(paper) ??
    inferYearFromText(asString(rawQuestion.id));
  const topic = asString(taxonomy?.primary_topic) ?? asString(taxonomy?.primaryTopic);

  return { year, topic, paper };
}

export function extractQuestionArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isRecord(payload) && Array.isArray(payload.questions)) {
    return payload.questions;
  }
  return [];
}

export function normalizePathForManifest(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function shouldIgnoreQuestionDataFile(relativePath: string): boolean {
  return normalizePathForManifest(relativePath) === "pipeline-sample.json";
}

export function resolveDatasetVersion(
  contentHashes: string[],
  environmentVersion: string | undefined = process.env.QUESTION_DATASET_VERSION,
): string {
  if (environmentVersion && environmentVersion.trim().length > 0) {
    return environmentVersion.trim();
  }
  return createHash("sha256").update(contentHashes.join("\n")).digest("hex").slice(0, 16);
}

export function extractImageBuffer(rawQuestion: unknown): Buffer | null {
  if (!isRecord(rawQuestion)) {
    return null;
  }
  const raw = rawQuestion.image;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  const dataUriMatch = raw.match(/^data:[^;]+;base64,(.+)$/s);
  const buffer = Buffer.from(dataUriMatch ? dataUriMatch[1] : raw, "base64");
  return buffer.length > 0 ? buffer : null;
}

export function buildQuestionImageProjection(rawQuestion: unknown): {
  buffer: Buffer;
  filename: string;
  url: string;
} | null {
  if (!isRecord(rawQuestion) || typeof rawQuestion.id !== "string") {
    return null;
  }
  const questionId = rawQuestion.id.trim();
  const buffer = extractImageBuffer(rawQuestion);
  if (!questionId || buffer === null) {
    return null;
  }
  const safeId = questionId.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_.\-]/g, "");
  const filename = `${safeId}.jpg`;
  return { buffer, filename, url: `/data/images/${filename}` };
}

export function projectQuestion(rawQuestion: unknown, imageUrl: string | null): unknown {
  if (!isRecord(rawQuestion)) {
    return rawQuestion;
  }
  const { image: _image, ...rest } = rawQuestion;
  void _image;

  let classification = rest.classification;
  if (isRecord(classification)) {
    const { question_text: _questionText, question_id: _questionId, ...classRest } = classification;
    void _questionText;
    void _questionId;
    classification = classRest;
  }

  return {
    ...rest,
    ...(classification !== undefined ? { classification } : {}),
    ...(imageUrl !== null ? { image_url: imageUrl } : {}),
  };
}

export function buildQuestionPackManifest(
  relativePath: string,
  questions: unknown[],
  bytes: number,
): QuestionPackManifest {
  const years = new Set<number>();
  const topics = new Set<string>();
  const papers = new Set<string>();
  for (const question of questions) {
    const meta = extractQuestionMeta(question);
    if (meta.year !== undefined) years.add(meta.year);
    if (meta.topic) topics.add(meta.topic);
    if (meta.paper) papers.add(meta.paper);
  }
  const normalizedPath = normalizePathForManifest(relativePath);
  return {
    id: normalizePathForManifest(relativePath.replace(/\.json$/i, "")),
    path: `data/packs/${normalizedPath}`,
    question_count: questions.length,
    years: [...years].sort((a, b) => a - b),
    topics: [...topics].sort((a, b) => a.localeCompare(b)),
    papers: [...papers].sort((a, b) => a.localeCompare(b)),
    bytes,
  };
}

export function sortPackManifestEntries(entries: PackManifestEntry[]): PackManifestEntry[] {
  return [...entries].sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
}
