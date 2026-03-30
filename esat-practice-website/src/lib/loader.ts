import pipelineSample from "../data/pipeline-sample.json";
import type { Question } from "../types/schema";
import { getDb } from "./db";

const QUESTION_DATA_MANIFEST_PATH = "data/manifest.json";
const QUESTION_DATA_STATE_KEY = "esat-practice:question-data-state";
const FALLBACK_DATASET_VERSION = "embedded-sample-2026-03-30";

interface RecordLike {
  [key: string]: unknown;
}

interface QuestionDataState {
  version: string;
  loaded_pack_ids: string[];
}

export interface QuestionPackManifest {
  id: string;
  path: string;
  question_count: number;
  years: number[];
  topics: string[];
  papers: string[];
  bytes?: number;
}

export interface QuestionDataManifest {
  version: string;
  generated_at: string;
  packs: QuestionPackManifest[];
}

export interface NormalizeResult {
  questions: Question[];
  skipped: number;
}

export interface LoaderSummary extends NormalizeResult {
  existing: number;
  inserted: number;
}

let bundledBootstrapPromise: Promise<LoaderSummary> | null = null;
let questionDataManifestPromise: Promise<QuestionDataManifest> | null = null;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null;
}

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

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function inferYearFromText(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function sanitizeId(value: string): string {
  return value
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .trim();
}

function normalizeAnswerLabel(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) {
    return undefined;
  }
  const match = text.toUpperCase().match(/[A-Z]/);
  return match?.[0];
}

function buildSource(questionRecord: RecordLike): Question["source"] {
  const nestedSource = isRecord(questionRecord.source)
    ? questionRecord.source
    : undefined;

  const paper =
    asString(nestedSource?.paper) ??
    asString(questionRecord.paper) ??
    asString(questionRecord.source) ??
    "Unknown Paper";
  const year =
    asNumber(nestedSource?.year) ??
    asNumber(questionRecord.year) ??
    inferYearFromText(paper) ??
    inferYearFromText(asString(questionRecord.id)) ??
    0;
  const part =
    asString(nestedSource?.part) ??
    asString(questionRecord.part) ??
    asString(questionRecord.section) ??
    "Part A";
  const subject =
    asString(nestedSource?.subject) ??
    asString(questionRecord.subject) ??
    "Unspecified";
  const page =
    asNumber(nestedSource?.page) ?? asNumber(questionRecord.page) ?? 0;

  return {
    paper,
    year,
    part,
    subject,
    page,
  };
}

function buildQuestionId(
  questionRecord: RecordLike,
  source: Question["source"],
  index: number,
): string {
  const rawId = asString(questionRecord.id);
  if (rawId) {
    return sanitizeId(rawId);
  }

  const paperCode = source.paper
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const pageCode = String(source.page).padStart(2, "0");
  const questionCode = String(index + 1).padStart(2, "0");
  return `${paperCode}_${pageCode}_Q${questionCode}`;
}

function ensureUniqueId(baseId: string, usedIds: Set<string>): string {
  let candidateId = baseId;
  let serial = 2;
  while (usedIds.has(candidateId)) {
    candidateId = `${baseId}_${serial}`;
    serial += 1;
  }
  usedIds.add(candidateId);
  return candidateId;
}

function buildTaxonomy(questionRecord: RecordLike): Question["taxonomy"] {
  const taxonomySource = isRecord(questionRecord.classification)
    ? questionRecord.classification
    : isRecord(questionRecord.taxonomy)
      ? questionRecord.taxonomy
      : {};

  const primaryTopic =
    asString(taxonomySource.primary_topic) ??
    asString(taxonomySource.primaryTopic) ??
    "Unclassified";

  const secondaryFromClassification = Array.isArray(
    taxonomySource.secondary_topics,
  )
    ? taxonomySource.secondary_topics
    : [];
  const alternatives = Array.isArray(taxonomySource.alternative_topics)
    ? taxonomySource.alternative_topics
    : [];
  const secondaryTopics = [...secondaryFromClassification, ...alternatives]
    .map((topic) => asString(topic))
    .filter((topic): topic is string =>
      Boolean(topic && topic !== primaryTopic),
    );

  return {
    primary_topic: primaryTopic,
    secondary_topics: [...new Set(secondaryTopics)],
    confidence: clamp01(asNumber(taxonomySource.confidence) ?? 0),
    model_used: asString(taxonomySource.model_used) ?? "unknown",
  };
}

function buildVerified(questionRecord: RecordLike): boolean {
  const answerRecord = isRecord(questionRecord.answer)
    ? questionRecord.answer
    : undefined;
  const taxonomySource = isRecord(questionRecord.classification)
    ? questionRecord.classification
    : isRecord(questionRecord.taxonomy)
      ? questionRecord.taxonomy
      : {};

  if (typeof answerRecord?.verified === "boolean") {
    return answerRecord.verified;
  }
  if (typeof taxonomySource.verified === "boolean") {
    return taxonomySource.verified;
  }
  return false;
}

function mapSingleQuestion(
  rawQuestion: unknown,
  index: number,
  usedIds: Set<string>,
): Question | null {
  if (!isRecord(rawQuestion)) {
    return null;
  }

  const source = buildSource(rawQuestion);
  const text =
    asString(rawQuestion.text) ?? asString(rawQuestion.question_text);
  if (!text) {
    return null;
  }

  const normalizedCorrect =
    normalizeAnswerLabel(rawQuestion.correctAnswer) ??
    normalizeAnswerLabel(rawQuestion.correct_answer) ??
    normalizeAnswerLabel(
      isRecord(rawQuestion.answer) ? rawQuestion.answer.correct : undefined,
    ) ??
    "A";

  const id = ensureUniqueId(
    buildQuestionId(rawQuestion, source, index),
    usedIds,
  );
  const taxonomy = buildTaxonomy(rawQuestion);
  const imageB64 =
    asString(rawQuestion.image_b64) ?? asString(rawQuestion.image);

  return {
    id,
    source,
    content: {
      text,
      ...(imageB64 ? { image_b64: imageB64 } : {}),
    },
    answer: {
      correct: normalizedCorrect,
      verified: buildVerified(rawQuestion),
    },
    taxonomy,
    meta: {
      times_attempted: 0,
      accuracy_rate: 0,
    },
  };
}

function extractQuestionArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isRecord(payload) && Array.isArray(payload.questions)) {
    return payload.questions;
  }
  return [];
}

function normalizeQuestionPackManifest(rawPack: unknown): QuestionPackManifest | null {
  if (!isRecord(rawPack)) {
    return null;
  }

  const id = asString(rawPack.id);
  const path = asString(rawPack.path);
  if (!id || !path) {
    return null;
  }

  const years = Array.isArray(rawPack.years)
    ? rawPack.years
        .map((value) => asNumber(value))
        .filter((value): value is number => value !== undefined)
    : [];
  const topics = Array.isArray(rawPack.topics)
    ? rawPack.topics
        .map((value) => asString(value))
        .filter((value): value is string => value !== undefined)
    : [];
  const papers = Array.isArray(rawPack.papers)
    ? rawPack.papers
        .map((value) => asString(value))
        .filter((value): value is string => value !== undefined)
    : [];
  const questionCount = asNumber(rawPack.question_count) ?? 0;
  const bytes = asNumber(rawPack.bytes);

  return {
    id,
    path,
    question_count: Math.max(0, Math.floor(questionCount)),
    years: [...new Set(years)],
    topics: [...new Set(topics)],
    papers: [...new Set(papers)],
    ...(bytes !== undefined ? { bytes } : {}),
  };
}

function getFallbackManifest(): QuestionDataManifest {
  return {
    version: FALLBACK_DATASET_VERSION,
    generated_at: "2026-03-30T00:00:00.000Z",
    packs: [
      {
        id: "pipeline-sample",
        path: "",
        question_count: 2,
        years: [0],
        topics: ["Unclassified"],
        papers: ["Sample"],
      },
    ],
  };
}

function resolveDataBaseUrl(): string {
  const importMetaWithEnv = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };
  const configured = importMetaWithEnv.env?.VITE_DATA_BASE_URL;
  if (!configured || configured.trim().length === 0) {
    return "";
  }
  return configured.replace(/\/+$/, "");
}

function resolveDataUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");
  const dataBaseUrl = resolveDataBaseUrl();
  if (!dataBaseUrl) {
    return `/${normalizedPath}`;
  }
  return `${dataBaseUrl}/${normalizedPath}`;
}

async function fetchJson(url: string, cacheMode: RequestCache): Promise<unknown> {
  const response = await fetch(url, { cache: cacheMode });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.json() as Promise<unknown>;
}

function readQuestionDataState(): QuestionDataState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(QUESTION_DATA_STATE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    const version = asString(parsed.version);
    const loadedPackIds = Array.isArray(parsed.loaded_pack_ids)
      ? parsed.loaded_pack_ids
          .map((value) => asString(value))
          .filter((value): value is string => value !== undefined)
      : [];
    if (!version) {
      return null;
    }

    return {
      version,
      loaded_pack_ids: [...new Set(loadedPackIds)],
    };
  } catch {
    return null;
  }
}

function writeQuestionDataState(state: QuestionDataState): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(QUESTION_DATA_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage access errors; bootstrap still succeeds.
  }
}

export function normalizePipelinePayload(
  payload: unknown,
  usedIds: Set<string> = new Set<string>(),
): NormalizeResult {
  const questionItems = extractQuestionArray(payload);
  const questions: Question[] = [];
  let skipped = 0;

  questionItems.forEach((questionItem, index) => {
    const mapped = mapSingleQuestion(questionItem, index, usedIds);
    if (!mapped) {
      skipped += 1;
      return;
    }
    questions.push(mapped);
  });

  return { questions, skipped };
}

export function normalizePipelinePayloads(
  payloads: unknown[],
): NormalizeResult {
  const usedIds = new Set<string>();
  const questions: Question[] = [];
  let skipped = 0;

  payloads.forEach((payload) => {
    const normalized = normalizePipelinePayload(payload, usedIds);
    skipped += normalized.skipped;
    questions.push(...normalized.questions);
  });

  return {
    questions,
    skipped,
  };
}

export async function bootstrapQuestions(
  payload: unknown,
): Promise<LoaderSummary> {
  const database = await getDb();
  const existing = await database.count("questions");
  const payloads = Array.isArray(payload) ? payload : [payload];
  const { questions, skipped } = normalizePipelinePayloads(payloads);

  const transaction = database.transaction("questions", "readwrite");
  let inserted = 0;
  for (const question of questions) {
    const existingQuestion = await transaction.store.get(question.id);
    if (!existingQuestion) {
      inserted += 1;
    }
    await transaction.store.put(
      existingQuestion
        ? { ...question, meta: existingQuestion.meta }
        : question,
    );
  }
  await transaction.done;

  return {
    existing,
    inserted,
    skipped,
    questions,
  };
}

export async function loadQuestionDataManifest(): Promise<QuestionDataManifest> {
  if (!questionDataManifestPromise) {
    questionDataManifestPromise = (async () => {
      try {
        const payload = await fetchJson(
          resolveDataUrl(QUESTION_DATA_MANIFEST_PATH),
          "no-store",
        );
        if (!isRecord(payload)) {
          return getFallbackManifest();
        }
        const version = asString(payload.version);
        const generatedAt = asString(payload.generated_at);
        const rawPacks = Array.isArray(payload.packs) ? payload.packs : [];
        const packs = rawPacks
          .map((rawPack) => normalizeQuestionPackManifest(rawPack))
          .filter((pack): pack is QuestionPackManifest => pack !== null);

        if (!version || !generatedAt || packs.length === 0) {
          return getFallbackManifest();
        }

        return {
          version,
          generated_at: generatedAt,
          packs,
        };
      } catch {
        return getFallbackManifest();
      }
    })();
  }

  return questionDataManifestPromise;
}

async function loadPackPayload(pack: QuestionPackManifest): Promise<unknown> {
  if (!pack.path) {
    return pipelineSample;
  }
  return fetchJson(resolveDataUrl(pack.path), "force-cache");
}

export async function ensureQuestionPacksBootstrapped(
  packIds: string[],
): Promise<LoaderSummary> {
  const manifest = await loadQuestionDataManifest();
  const existingDatabase = await getDb();
  const existing = await existingDatabase.count("questions");
  const targetPackIds = new Set(packIds);
  if (targetPackIds.size === 0) {
    return {
      existing,
      inserted: 0,
      skipped: 0,
      questions: [],
    };
  }

  const previousState = readQuestionDataState();
  const loadedPackIds =
    previousState && previousState.version === manifest.version
      ? new Set(previousState.loaded_pack_ids)
      : new Set<string>();

  let inserted = 0;
  let skipped = 0;

  for (const pack of manifest.packs) {
    if (!targetPackIds.has(pack.id) || loadedPackIds.has(pack.id)) {
      continue;
    }

    const payload = await loadPackPayload(pack);
    const summary = await bootstrapQuestions(payload);
    inserted += summary.inserted;
    skipped += summary.skipped;
    loadedPackIds.add(pack.id);
    writeQuestionDataState({
      version: manifest.version,
      loaded_pack_ids: [...loadedPackIds],
    });
  }

  return {
    existing,
    inserted,
    skipped,
    questions: [],
  };
}

export async function listQuestionDataPacks(): Promise<QuestionPackManifest[]> {
  const manifest = await loadQuestionDataManifest();
  return manifest.packs;
}

export function getBundledPipelineSample(): unknown {
  return pipelineSample;
}

export async function bootstrapBundledQuestions(): Promise<LoaderSummary> {
  const manifest = await loadQuestionDataManifest();
  return ensureQuestionPacksBootstrapped(manifest.packs.map((pack) => pack.id));
}

export function ensureBundledQuestionsBootstrapped(): Promise<LoaderSummary> {
  if (!bundledBootstrapPromise) {
    bundledBootstrapPromise = bootstrapBundledQuestions().catch((error: unknown) => {
      bundledBootstrapPromise = null;
      throw error;
    });
  }

  return bundledBootstrapPromise;
}
