import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractMetaSource } from "../src/content/revision/mdxSource";

const REVISION_DIR = path.resolve(process.cwd(), "src/content/revision");
const TOPICS_DIR = path.join(REVISION_DIR, "topics");
const OUTPUT_PATH = path.join(REVISION_DIR, "revision-meta.json");

async function listMdxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMdxFiles(full)));
    } else if (entry.name.endsWith(".mdx")) {
      files.push(full);
    }
  }
  return files;
}

/** Evaluate the `export const meta = {...}` block as a plain object. Content is trusted (our own source). */
function parseMeta(block: string): Record<string, unknown> {
  const objStart = block.indexOf("{");
  const objText = block.slice(objStart).replace(/;\s*$/, "");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return Function(`"use strict"; return (${objText});`)() as Record<string, unknown>;
}

async function main(): Promise<void> {
  const files = (await listMdxFiles(TOPICS_DIR)).sort();
  const entries: { path: string; meta: Record<string, unknown> }[] = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const block = extractMetaSource(raw);
    if (!block) continue;

    const meta = parseMeta(block);
    // Glob key relative to manifest.ts, e.g. "./topics/m1/units.mdx".
    const rel = `./${path.relative(REVISION_DIR, file).split(path.sep).join("/")}`;
    entries.push({ path: rel, meta });
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  console.log(`Prepared revision meta for ${entries.length} topics`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

void main();
