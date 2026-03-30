import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore - Vite handles this as a URL import
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { createLogger } from "./logger";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const log = createLogger("pdf-processor");

export interface PageData {
  pageNumber: number;
  text: string;
  image?: string;
}

export interface PdfExtractionOptions {
  includeImages?: boolean;
  imageScale?: number;
  imageQuality?: number;
}

/**
 * Render a raster preview per page so downstream steps can display diagrams
 * even when text extraction misses structure.
 */
async function renderPageToImage(
  page: any,
  scale: number,
  quality: number,
): Promise<string> {
  const pageNumber = page?.pageNumber ?? "unknown";
  const renderLog = log.child(`render-page-${pageNumber}`);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await renderLog.timeAsync(
    "jpeg-render",
    async () =>
      page.render({
        canvasContext: ctx,
        viewport,
      }).promise,
    {
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      scale,
      quality,
    },
  );

  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Extract text (and optional page images) from a PDF and preserve rough
 * X-position markers in output text for later segmentation heuristics.
 */
export async function extractTextFromPDF(
  file: File,
  onProgress?: (page: number, total: number, detail: string) => void,
  options?: PdfExtractionOptions,
): Promise<PageData[]> {
  const extractionLog = log.child("extract");
  const includeImages = options?.includeImages ?? true;
  const imageScale = Math.max(0.5, Math.min(3, options?.imageScale ?? 1.5));
  const imageQuality = Math.max(0.2, Math.min(1, options?.imageQuality ?? 0.6));

  extractionLog.info("start", {
    file_name: file.name,
    file_size_bytes: file.size,
    include_images: includeImages,
    image_scale: imageScale,
    image_quality: imageQuality,
  });

  try {
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    const result: PageData[] = [];
    const extractionStart = performance.now();

    extractionLog.info("document-loaded", {
      page_count: pdf.numPages,
    });
    onProgress?.(0, pdf.numPages, "Starting PDF load...");

    for (let i = 1; i <= pdf.numPages; i++) {
      const pageStart = performance.now();
      onProgress?.(i, pdf.numPages, `Reading page ${i}`);

      const page = await pdf.getPage(i);

      let image: string | undefined;
      if (includeImages) {
        onProgress?.(i, pdf.numPages, `Rendering page ${i}`);
        image = await renderPageToImage(page, imageScale, imageQuality);
      }

      onProgress?.(i, pdf.numPages, `Extracting text ${i}`);

      const textContent = await page.getTextContent();
      const items = textContent.items as any[];

      // PDF text comes as scattered glyphs, so rebuild approximate reading order.
      items.sort((a, b) => {
        const yDiff = Math.abs(a.transform[5] - b.transform[5]);
        if (yDiff > 4) {
          return b.transform[5] - a.transform[5];
        }
        return a.transform[4] - b.transform[4];
      });

      let text = "";
      let lastY = -1;
      let lastXEnd = -1;

      for (const item of items) {
        const x = item.transform[4];
        const y = item.transform[5];
        const width = typeof item.width === "number" ? item.width : 0;
        const newLine = lastY === -1 || Math.abs(y - lastY) > 4;

        if (newLine) {
          if (text) text += "\n";
          text += `[X:${Math.round(x)}]`;
          lastXEnd = x;
        } else if (lastXEnd !== -1) {
          const gap = x - lastXEnd;
          if (gap > 6) text += " ";
        }

        text += item.str;
        lastY = y;
        lastXEnd = x + width;
      }

      result.push({
        pageNumber: i,
        text,
        image,
      });

      extractionLog.debug("page-complete", {
        page: i,
        total_pages: pdf.numPages,
        chars: text.length,
        glyphs: items.length,
        image_chars: image?.length ?? 0,
        elapsed_ms: Math.round(performance.now() - pageStart),
      });
    }

    onProgress?.(pdf.numPages, pdf.numPages, "Done");
    extractionLog.info("complete", {
      page_count: pdf.numPages,
      elapsed_ms: Math.round(performance.now() - extractionStart),
    });
    return result;
  } catch (error) {
    extractionLog.error("failed", error instanceof Error ? error : undefined);
    throw new Error("Could not read PDF file");
  }
}

