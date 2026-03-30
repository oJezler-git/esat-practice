import { PageData } from "./pdf-processor";

export interface AnswerMapping {
  [questionNumber: string]: string;
}

/**
 * Central validation gate for extracted answer pairs.
 * Keeping this in one place avoids subtle differences between line-level and
 * page-level passes when we parse messy OCR/PDF text.
 *
 * @param {AnswerMapping} mapping Accumulator keyed by question number.
 * @param {string} questionRaw Raw question token captured from text.
 * @param {string} answerRaw Raw answer token captured from text.
 * @returns {void} Mutates `mapping` in place when the pair is valid.
 */
function addAnswer(
  mapping: AnswerMapping,
  questionRaw: string,
  answerRaw: string,
) {
  const questionNumber = Number.parseInt(questionRaw, 10);
  if (!Number.isFinite(questionNumber)) return;

  // Sanity bounds — these papers never exceed ~100 questions (90 is max for NSAA and 40 for ENGAA).
  if (questionNumber < 1 || questionNumber > 100) return;

  const normalisedAnswer = answerRaw.toUpperCase();

  // MCQ answers are always single letters A–H
  if (!/^[A-H]$/.test(normalisedAnswer)) return;

  mapping[String(questionNumber)] = normalisedAnswer;
}

/**
 * Parses an answer key PDF into a { questionNumber -> answer } map.
 *
 * This parser is intentionally permissive because answer keys aren't laid out
 * consistently between papers, and PDF extraction often merges columns.
 * We run both a line-based pass and a whole-page pass; that is redundant on
 * clean inputs but catches real-world failures where line breaks are unreliable.
 *
 * @param {PageData[]} pages Extracted page payloads from the PDF pipeline.
 * @returns {AnswerMapping} Normalized lookup of question number -> answer letter.
 */
export function parseAnswerKey(pages: PageData[]): AnswerMapping {
  const mapping: AnswerMapping = {};

  // Flexible enough to catch most formats without over-matching
  const answerRegex = /(?:^|\s)(?:Q\s*)?(\d{1,3})\s*([A-H])(?=\s|$)/gi;

  for (const page of pages) {
    const lines = page.text.split("\n");

    for (const line of lines) {
      // Clean up common PDF artefacts before matching:
      // - position markers like [X:123]
      // - merged tokens like "1G46A"
      const cleanLine = line
        .replace(/\[X:\d+\]/g, " ")
        .replace(/([A-H])(?=\d)/gi, "$1 ") // split "G46" -> "G 46"
        .replace(/[_|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      let match: RegExpExecArray | null;
      answerRegex.lastIndex = 0;

      // Iterate rather than matchAll for better control/debugging
      while ((match = answerRegex.exec(cleanLine)) !== null) {
        addAnswer(mapping, match[1], match[2]);
      }
    }

    // Second pass over the full page — helps when line splitting is unreliable
    const fullPage = page.text
      .replace(/\[X:\d+\]/g, " ")
      .replace(/([A-H])(?=\d)/gi, "$1 ")
      .replace(/[_|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    let match: RegExpExecArray | null;
    answerRegex.lastIndex = 0;

    while ((match = answerRegex.exec(fullPage)) !== null) {
      addAnswer(mapping, match[1], match[2]);
    }
  }

  return mapping;
}

/**
 * Extracts a stable prefix from filenames so question papers
 * can be matched with their corresponding answer keys.
 *
 * It's not trying to be a universal filename parser, just deterministic enough
 * for the conventions we use in this dataset.
 *
 * @param {string} filename Source filename from upload/import.
 * @returns {string} Normalized prefix used for paper/answer-key matching.
 */
export function getPaperPrefix(filename: string): string {
  // Stop at common suffix markers — this doesn't need to be perfect,
  // just consistent across both files.
  const match = filename.match(
    /^(.*?)(?:_QuestionPaper|_AnswerKey|_Answers|_Paper|[\s\(]|$)/i,
  );

  return match ? match[1].trim() : filename;
}
