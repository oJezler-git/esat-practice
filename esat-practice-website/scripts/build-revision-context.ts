import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractMetaSource, stripMdxExports } from "../src/content/revision/mdxSource";

const TOPICS_DIR = path.resolve(process.cwd(), "src/content/revision/topics");
const OUTPUT_PATH = path.resolve(process.cwd(), "cloudflare-worker/revision-context.json");

interface RevisionContextEntry {
  title: string;
  content: string;
}

function extractField(metaBlock: string, field: string): string {
  const match = metaBlock.match(new RegExp(`${field}:\\s*"([^"]*)"`));
  return match?.[1] ?? "";
}

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

async function main(): Promise<void> {
  const files = await listMdxFiles(TOPICS_DIR);
  const context: Record<string, RevisionContextEntry> = {};

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const metaBlock = extractMetaSource(raw);
    if (!metaBlock) continue;

    const module = extractField(metaBlock, "module");
    const slug = extractField(metaBlock, "slug");
    const title = extractField(metaBlock, "title");
    if (!module || !slug) continue;

    context[`${module}/${slug}`] = {
      title,
      content: stripMdxExports(raw),
    };
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  console.log(`Prepared revision context for ${Object.keys(context).length} topics`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

void main();
