#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const targetArg = process.argv[2] ?? ".";
const expectedArg = Number.parseInt(process.argv[3] ?? "40", 10);
const expectedCount = Number.isFinite(expectedArg) ? expectedArg : 40;
const targetPath = path.resolve(process.cwd(), targetArg);

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".turbo",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectJsonFiles(entryPath, files = []) {
  if (!fs.existsSync(entryPath)) {
    return files;
  }

  const stat = fs.statSync(entryPath);
  if (stat.isFile()) {
    if (entryPath.toLowerCase().endsWith(".json")) {
      files.push(entryPath);
    }
    return files;
  }

  if (!stat.isDirectory()) {
    return files;
  }

  const entries = fs.readdirSync(entryPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        collectJsonFiles(nextPath, files);
      }
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(nextPath);
    }
  }
  return files;
}

function isQuestionLike(value) {
  if (!isObject(value)) return false;

  const hasId =
    typeof value.id === "string" || typeof value.question_id === "string";
  const hasText =
    typeof value.text === "string" || typeof value.question_text === "string";
  const hasNumber =
    typeof value.number === "string" || typeof value.number === "number";
  const hasContextHint =
    typeof value.page === "number" ||
    typeof value.section === "string" ||
    typeof value.part === "string" ||
    typeof value.source === "string" ||
    typeof value.paperId === "string" ||
    typeof value.primary_topic === "string";

  return (
    (hasId && (hasText || hasNumber || hasContextHint)) ||
    (hasNumber && hasText) ||
    (hasText && hasContextHint)
  );
}

function findQuestionArrays(root) {
  const arrays = [];
  const seenArrays = new WeakSet();

  function walk(node, pointer) {
    if (Array.isArray(node)) {
      if (seenArrays.has(node)) return;
      seenArrays.add(node);

      const questionEntries = node.filter(isQuestionLike);
      const denseEnough =
        questionEntries.length >= 3 &&
        questionEntries.length >= Math.ceil(node.length * 0.6);

      if (denseEnough) {
        arrays.push({ pointer, entries: questionEntries });
        return;
      }

      for (let index = 0; index < node.length; index += 1) {
        walk(node[index], `${pointer}[${index}]`);
      }
      return;
    }

    if (!isObject(node)) return;

    for (const [key, value] of Object.entries(node)) {
      walk(value, `${pointer}.${key}`);
    }
  }

  walk(root, "$");
  return arrays;
}

function inferPaperKey(entry) {
  const direct =
    entry.source ??
    entry.paperId ??
    entry.paper_id ??
    entry.paper ??
    entry.paperName ??
    entry.questionPaper;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const qid = typeof entry.question_id === "string" ? entry.question_id : "";
  if (!qid) return "unknown";

  const nsaaLike = qid.match(/^(.*?\.pdf)-PART-[A-Z]-\d+$/i);
  if (nsaaLike?.[1]) return nsaaLike[1];

  const generic = qid.match(/^(.*?\.pdf)-/i);
  if (generic?.[1]) return generic[1];

  return "unknown";
}

function countByPaper(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = inferPaperKey(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function rel(filePath) {
  return path.relative(process.cwd(), filePath) || filePath;
}

const jsonFiles = collectJsonFiles(targetPath);
let datasetsFound = 0;
const mismatches = [];

for (const file of jsonFiles) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    continue;
  }

  const arrays = findQuestionArrays(parsed);
  if (arrays.length === 0) continue;

  for (const arrayInfo of arrays) {
    datasetsFound += 1;
    const byPaper = countByPaper(arrayInfo.entries);

    for (const [paper, count] of byPaper.entries()) {
      if (count !== expectedCount) {
        mismatches.push({
          file: rel(file),
          pointer: arrayInfo.pointer,
          paper,
          count,
        });
      }
    }
  }
}

console.log(`Scanned JSON files: ${jsonFiles.length}`);
console.log(`Detected question datasets: ${datasetsFound}`);
console.log(`Expected question count: ${expectedCount}`);

if (mismatches.length === 0) {
  console.log("All detected paper groups match the expected count.");
  process.exit(0);
}

console.log("\nMismatches:");
for (const mismatch of mismatches) {
  console.log(
    `- ${mismatch.file} | ${mismatch.pointer} | paper=${mismatch.paper} | count=${mismatch.count}`,
  );
}

process.exit(1);
