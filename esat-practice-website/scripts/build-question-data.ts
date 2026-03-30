import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

interface QuestionPackManifest {
  id: string;
  path: string;
  question_count: number;
  years: number[];
  topics: string[];
  papers: string[];
  bytes: number;
}

interface QuestionDataManifest {
  version: string;
  generated_at: string;
  packs: QuestionPackManifest[];
}

type RecordLike = Record<string, unknown>;

const INPUT_DIR = path.resolve(process.cwd(), "src/data");
const OUTPUT_DIR = path.resolve(process.cwd(), "public/data/packs");
const MANIFEST_PATH = path.resolve(process.cwd(), "public/data/manifest.json");

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

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null;
}

function inferYearFromText(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
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
    asString(source?.paper) ??
    asString(rawQuestion.paper) ??
    asString(rawQuestion.source);
  const year =
    asNumber(source?.year) ??
    asNumber(rawQuestion.year) ??
    inferYearFromText(paper) ??
    inferYearFromText(asString(rawQuestion.id));
  const topic =
    asString(taxonomy?.primary_topic) ??
    asString(taxonomy?.primaryTopic);

  return { year, topic, paper };
}

async function listJsonFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return listJsonFiles(fullPath);
      }
      if (entry.isFile() && fullPath.toLowerCase().endsWith(".json")) {
        return [fullPath];
      }
      return [];
    }),
  );
  return files.flat();
}

function normalizePathForManifest(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function resolveDatasetVersion(): string {
  const fromEnv = process.env.QUESTION_DATASET_VERSION;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return new Date().toISOString().slice(0, 10);
}

async function prepareOutputDirs(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
}

async function buildPackManifestEntry(filePath: string): Promise<QuestionPackManifest | null> {
  const relativeFromInput = path.relative(INPUT_DIR, filePath);
  if (relativeFromInput === "pipeline-sample.json") {
    return null;
  }

  const rawText = await readFile(filePath, "utf8");
  const payload = JSON.parse(rawText) as unknown;
  const questions = extractQuestionArray(payload);
  if (questions.length === 0) {
    return null;
  }

  const years = new Set<number>();
  const topics = new Set<string>();
  const papers = new Set<string>();

  questions.forEach((question) => {
    const meta = extractQuestionMeta(question);
    if (meta.year !== undefined) {
      years.add(meta.year);
    }
    if (meta.topic) {
      topics.add(meta.topic);
    }
    if (meta.paper) {
      papers.add(meta.paper);
    }
  });

  const outputRelativePath = normalizePathForManifest(relativeFromInput);
  const outputPath = path.join(OUTPUT_DIR, relativeFromInput);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await cp(filePath, outputPath, { force: true });

  const fileStats = await stat(filePath);
  return {
    id: normalizePathForManifest(relativeFromInput.replace(/\.json$/i, "")),
    path: `data/packs/${outputRelativePath}`,
    question_count: questions.length,
    years: [...years].sort((a, b) => a - b),
    topics: [...topics].sort((a, b) => a.localeCompare(b)),
    papers: [...papers].sort((a, b) => a.localeCompare(b)),
    bytes: fileStats.size,
  };
}

async function main(): Promise<void> {
  await prepareOutputDirs();

  const inputFiles = await listJsonFiles(INPUT_DIR);
  const manifests = await Promise.all(
    inputFiles.map((filePath) => buildPackManifestEntry(filePath)),
  );
  const packs = manifests
    .filter((entry): entry is QuestionPackManifest => entry !== null)
    .sort((left, right) => left.id.localeCompare(right.id));

  const manifest: QuestionDataManifest = {
    version: resolveDatasetVersion(),
    generated_at: new Date().toISOString(),
    packs,
  };

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const totalBytes = packs.reduce((sum, pack) => sum + pack.bytes, 0);
  const totalQuestions = packs.reduce((sum, pack) => sum + pack.question_count, 0);

  console.log(
    `Prepared ${packs.length} data packs (${totalQuestions} questions, ${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`,
  );
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

void main();
