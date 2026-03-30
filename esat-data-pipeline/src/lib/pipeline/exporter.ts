import { ClassificationResult } from "./types";

interface PipelineRunExport {
  version: number;
  exportedAt: number;
  results: ClassificationResult[];
}

/**
 * Serialises pipeline results with a tiny versioned envelope.
 * Versioning keeps this forward-compatible if we add fields later.
 *
 * @param {ClassificationResult[]} results Pipeline output rows.
 * @returns {string} JSON string ready for persistence/download.
 */
export function toJSON(results: ClassificationResult[]): string {
  const payload: PipelineRunExport = {
    version: 1,
    exportedAt: Date.now(),
    results,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Browser-only download helper for pipeline exports.
 * Assumes caller has already chosen a safe filename and data scope.
 *
 * @param {ClassificationResult[]} results Pipeline output rows.
 * @param {string} filename Desired download filename.
 * @returns {void} Triggers a browser download.
 */
export function downloadJSON(
  results: ClassificationResult[],
  filename: string,
): void {
  const content = toJSON(results);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
