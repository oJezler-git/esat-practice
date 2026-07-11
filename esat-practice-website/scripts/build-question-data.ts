import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  buildQuestionImageProjection,
  buildQuestionPackManifest,
  extractQuestionArray,
  isRecord,
  projectQuestion,
  resolveDatasetVersion,
  shouldIgnoreQuestionDataFile,
  sortPackManifestEntries,
} from "./build-question-data-helpers";
import type { PackManifestEntry, QuestionPackManifest } from "./build-question-data-helpers";

interface QuestionDataManifest {
  version: string;
  generated_at: string;
  packs: QuestionPackManifest[];
}

const INPUT_DIR = path.resolve(process.cwd(), "src/data");
const OUTPUT_DIR = path.resolve(process.cwd(), "public/data/packs");
const IMAGES_OUTPUT_DIR = path.resolve(process.cwd(), "public/data/images");
const MANIFEST_PATH = path.resolve(process.cwd(), "public/data/manifest.json");

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

async function prepareOutputDirs(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await rm(IMAGES_OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(IMAGES_OUTPUT_DIR, { recursive: true });
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
}

async function buildPackManifestEntry(filePath: string): Promise<PackManifestEntry | null> {
  const relativeFromInput = path.relative(INPUT_DIR, filePath);
  if (shouldIgnoreQuestionDataFile(relativeFromInput)) {
    return null;
  }

  const rawText = await readFile(filePath, "utf8");
  const payload = JSON.parse(rawText) as unknown;
  const questions = extractQuestionArray(payload);
  if (questions.length === 0) {
    return null;
  }

  // Project each question: extract images and strip redundant fields.
  const projectedQuestions: unknown[] = [];
  let extractedImageCount = 0;

  for (const question of questions) {
    let imageUrl: string | null = null;
    const imageProjection = buildQuestionImageProjection(question);
    if (imageProjection !== null) {
      await writeFile(path.join(IMAGES_OUTPUT_DIR, imageProjection.filename), imageProjection.buffer);
      imageUrl = imageProjection.url;
      extractedImageCount += 1;
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
    manifest: buildQuestionPackManifest(relativeFromInput, questions, projectedBytes),
    contentHash,
  };
}

async function main(): Promise<void> {
  await prepareOutputDirs();

  const inputFiles = await listJsonFiles(INPUT_DIR);
  const entries = await Promise.all(
    inputFiles.map((filePath) => buildPackManifestEntry(filePath)),
  );
  const resolvedEntries = sortPackManifestEntries(
    entries.filter((entry): entry is PackManifestEntry => entry !== null),
  );
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
