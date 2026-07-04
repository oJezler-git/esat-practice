import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
const IMAGES_OUTPUT_DIR = path.resolve(process.cwd(), "public/data/images");
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

function resolveDatasetVersion(contentHashes: string[]): string {
  const fromEnv = process.env.QUESTION_DATASET_VERSION;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  // Derive the version from pack contents so unrelated rebuilds (e.g. a
  // production deploy that reruns data:prepare) don't bust every client's
  // cached IndexedDB state and re-trigger the "Loading question bank" popup.
  return createHash("sha256").update(contentHashes.join("\n")).digest("hex").slice(0, 16);
}

async function prepareOutputDirs(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await rm(IMAGES_OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(IMAGES_OUTPUT_DIR, { recursive: true });
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
}

/**
 * Extract a base64 image string from a raw question record.
 * Accepts both bare base64 and data-URI strings.
 * Returns the raw binary Buffer, or null if no image is present.
 */
function extractImageBuffer(rawQuestion: unknown): Buffer | null {
  if (!isRecord(rawQuestion)) {
    return null;
  }
  const raw = rawQuestion.image;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  const dataUriMatch = raw.match(/^data:[^;]+;base64,(.+)$/s);
  const b64 = dataUriMatch ? dataUriMatch[1] : raw;
  try {
    const buf = Buffer.from(b64, "base64");
    // Sanity-check: a valid JPEG starts with FF D8, PNG with 89 50 4E 47.
    // Accept any non-empty buffer — if decoding produced garbage it will
    // simply be an unrenderable image rather than crashing the build.
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Project a raw question record to a leaner form suitable for the
 * published pack files:
 *  - Replace the `image` base64 field with `image_url` (a static path).
 *  - Strip `classification.question_text` and `classification.question_id`
 *    (verbatim duplicates of the top-level `text` and `id` fields).
 *  - All other fields are preserved verbatim.
 */
function projectQuestion(
  rawQuestion: unknown,
  imageUrl: string | null,
): unknown {
  if (!isRecord(rawQuestion)) {
    return rawQuestion;
  }

  // Build the projected record without the raw image field.
  const { image: _image, ...rest } = rawQuestion;
  void _image;

  // Strip the redundant duplicate fields from the classification block.
  let classification = rest.classification;
  if (isRecord(classification)) {
    const { question_text: _qt, question_id: _qi, ...classRest } = classification;
    void _qt;
    void _qi;
    classification = classRest;
  }

  return {
    ...rest,
    ...(classification !== undefined ? { classification } : {}),
    ...(imageUrl !== null ? { image_url: imageUrl } : {}),
  };
}

interface PackManifestEntry {
  manifest: QuestionPackManifest;
  contentHash: string;
}

async function buildPackManifestEntry(filePath: string): Promise<PackManifestEntry | null> {
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

  // Project each question: extract images and strip redundant fields.
  const projectedQuestions: unknown[] = [];
  let extractedImageCount = 0;

  for (const question of questions) {
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

    // Resolve the question ID used as the image filename.
    const questionId =
      isRecord(question) && typeof question.id === "string" && question.id.trim().length > 0
        ? question.id.trim()
        : null;

    let imageUrl: string | null = null;
    if (questionId !== null) {
      const imageBuffer = extractImageBuffer(question);
      if (imageBuffer !== null) {
        // Sanitise the ID the same way the runtime loader does.
        const safeId = questionId.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_.\-]/g, "");
        const imageFilename = `${safeId}.jpg`;
        const imageOutputPath = path.join(IMAGES_OUTPUT_DIR, imageFilename);
        await writeFile(imageOutputPath, imageBuffer);
        imageUrl = `/data/images/${imageFilename}`;
        extractedImageCount += 1;
      }
    }

    projectedQuestions.push(projectQuestion(question, imageUrl));
  }

  // Determine the shape of the projected payload: if the original was a
  // `{ questions: [...] }` wrapper, preserve the wrapper.
  const projectedPayload = Array.isArray(payload)
    ? projectedQuestions
    : isRecord(payload) && Array.isArray(payload.questions)
      ? { ...payload, questions: projectedQuestions }
      : projectedQuestions;

  const outputRelativePath = normalizePathForManifest(relativeFromInput);
  const outputPath = path.join(OUTPUT_DIR, relativeFromInput);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const projectedText = `${JSON.stringify(projectedPayload, null, 2)}\n`;
  await writeFile(outputPath, projectedText, "utf8");

  const projectedBytes = Buffer.byteLength(projectedText, "utf8");
  const contentHash = createHash("sha256").update(projectedText).digest("hex");

  if (extractedImageCount > 0) {
    console.log(`  ${relativeFromInput}: extracted ${extractedImageCount} image(s)`);
  }

  return {
    manifest: {
      id: normalizePathForManifest(relativeFromInput.replace(/\.json$/i, "")),
      path: `data/packs/${outputRelativePath}`,
      question_count: questions.length,
      years: [...years].sort((a, b) => a - b),
      topics: [...topics].sort((a, b) => a.localeCompare(b)),
      papers: [...papers].sort((a, b) => a.localeCompare(b)),
      bytes: projectedBytes,
    },
    contentHash,
  };
}

async function main(): Promise<void> {
  await prepareOutputDirs();

  const inputFiles = await listJsonFiles(INPUT_DIR);
  const entries = await Promise.all(
    inputFiles.map((filePath) => buildPackManifestEntry(filePath)),
  );
  const resolvedEntries = entries
    .filter((entry): entry is PackManifestEntry => entry !== null)
    .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
  const packs = resolvedEntries.map((entry) => entry.manifest);

  const manifest: QuestionDataManifest = {
    version: resolveDatasetVersion(resolvedEntries.map((entry) => entry.contentHash)),
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
