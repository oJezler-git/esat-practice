import { db, StoredQuestion, PaperMetadata } from "./db";

export interface ExportData {
  version: number;
  exportDate: number;
  papers: PaperMetadata[];
  questions: StoredQuestion[];
}

/**
 * Serialises the full local library into a portable snapshot.
 * We keep this as a single payload because the current dataset is small enough
 * that chunking/streaming adds complexity without much payoff.
 *
 * @returns {Promise<string>} JSON export string containing papers and questions.
 */
export async function exportLibrary(): Promise<string> {
  // pull everything out in one go – dataset should be small enough for now
  const papers = await db.papers.toArray();
  const questions = await db.questions.toArray();

  const data: ExportData = {
    version: 2, // bump this if structure changes
    exportDate: Date.now(),
    papers,
    questions,
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Tiny browser download helper used by export flows.
 * This intentionally avoids app-level UI concerns so it can be reused in tests
 * and background actions.
 *
 * @param {string} content File body to download.
 * @param {string} fileName Target filename shown to the user.
 * @param {string} contentType MIME type for the Blob payload.
 * @returns {void} Triggers a client-side download.
 */
export function downloadFile(
  content: string,
  fileName: string,
  contentType: string,
) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });

  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();

  // revoke straight away – fine for small files but might revisit if issues
  URL.revokeObjectURL(a.href);
}

/**
 * Parses an import payload and reports collisions up front so callers can pick
 * a conflict policy before we start mutating IndexedDB.
 *
 * @param {string} jsonString Raw JSON export payload.
 * @returns {Promise<{ data: ExportData; conflicts: { paperId: string; existingPaper: PaperMetadata; newPaper: PaperMetadata; }[]; }>} Parsed data plus detected paper ID conflicts.
 */
export async function getImportPreview(jsonString: string): Promise<{
  data: ExportData;
  conflicts: {
    paperId: string;
    existingPaper: PaperMetadata;
    newPaper: PaperMetadata;
  }[];
}> {
  const data: ExportData = JSON.parse(jsonString);

  // basic version gate – avoids breakage later
  if (data.version !== 1 && data.version !== 2) {
    throw new Error("Unsupported export version");
  }

  const existingPapers = await db.papers.toArray();
  const conflicts = [];

  // detect ID clashes so caller can decide what to do
  for (const newPaper of data.papers) {
    const existing = existingPapers.find((p) => p.id === newPaper.id);

    if (existing) {
      conflicts.push({
        paperId: newPaper.id,
        existingPaper: existing,
        newPaper,
      });
    }
  }

  return { data, conflicts };
}

export type ImportResolution = "overwrite" | "skip";

/**
 * Applies an import plan after conflict resolution.
 * "overwrite" is implemented as delete-then-upsert for that paper to avoid
 * duplicate question rows from previous imports.
 *
 * @param {ExportData} data Parsed import payload.
 * @param {Record<string, ImportResolution>} resolutions Conflict policy by paper ID.
 * @returns {Promise<void>} Completes when the import transaction is committed.
 */
export async function executeImport(
  data: ExportData,
  resolutions: Record<string, ImportResolution>,
) {
  // filter out anything explicitly skipped
  const papersToImport = data.papers.filter((p) => {
    const res = resolutions[p.id];
    return res !== "skip";
  });

  // only bring in questions that belong to included papers
  const paperIdsToImport = new Set(papersToImport.map((p) => p.id));
  const questionsToImport = data.questions.filter((q) =>
    paperIdsToImport.has(q.paperId),
  );

  await db.transaction("rw", db.papers, db.questions, async () => {
    // wipe questions for papers we're overwriting to avoid duplicates
    const overwriteIds = Object.entries(resolutions)
      .filter(([_, res]) => res === "overwrite")
      .map(([id, _]) => id);

    if (overwriteIds.length > 0) {
      await db.questions.where("paperId").anyOf(overwriteIds).delete();
    }

    // Dexie handles upserts here
    await db.papers.bulkPut(papersToImport);
    await db.questions.bulkPut(questionsToImport);
  });
}
