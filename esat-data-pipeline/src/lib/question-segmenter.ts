import { PageData } from "./pdf-processor";

export interface Question {
  id: string;
  number: string;
  text: string;
  page: number;
  section?: string;
  part?: string;
  subject?: string;
  source: string;
  year?: number;
  image?: string;
  correctAnswer?: string;
}

// Matches "PART A Mathematics", "PART E Advanced Mathematics and Advanced Physics", etc.
const PART_WITH_SUBJECT_REGEX =
  /PART\s+([A-E])\s+(Advanced\s+Mathematics\s+and\s+Advanced\s+Physics|Advanced\s+Physics\s+and\s+Mathematics|Mathematics|Physics|Chemistry|Biology)/i;

const PART_ONLY_REGEX = /PART\s+([A-E])/i;
const SECTION_REGEX = /Section\s+([12]|one|two)/i;

const MAX_SEQUENCE_JUMP = 2; // allows small skips (e.g. diagrams interfering)
const QUESTION_MARGIN_TOLERANCE = 8;

// Normalises inconsistent subject naming across papers
function normaliseSubject(subject: string): string {
  const compact = subject.replace(/\s+/g, " ").trim().toLowerCase();

  // Seen this ordering flipped in some papers
  if (compact === "advanced physics and mathematics") {
    return "Advanced Mathematics and Advanced Physics";
  }

  return compact.replace(/\b\w/g, (char) => char.toUpperCase());
}

// NSAA papers don't always state subject explicitly, so infer from part
function inferNsaaSubjectFromPart(partLetter: string): string | undefined {
  const mapping: Record<string, string> = {
    A: "Mathematics",
    B: "Physics",
    C: "Chemistry",
    D: "Biology",
    E: "Advanced Mathematics and Advanced Physics",
  };

  return mapping[partLetter.toUpperCase()];
}

/**
 * Removes layout noise that regularly leaks into extracted question text.
 * This is intentionally conservative: we strip known junk patterns but avoid
 * aggressive normalisation that might delete mathematically meaningful tokens.
 *
 * @param {string} text Raw question text assembled from page fragments.
 * @returns {string} Cleaned question text suitable for matching/classification.
 */
function cleanupQuestionText(text: string): string {
  return (
    text
      .replace(/\[X:\d+\]/g, " ") // positioning markers
      .replace(/(?:Â©|©|\(c\))\s*UCLES\s*\d{4}/gi, "") // copyright lines
      .replace(/\[\s*Turn\s*over/gi, "")
      .replace(/BLANK\s*PAGE/gi, "")
      // remove headers that sometimes get merged into questions
      .replace(
        /\bPART\s+[A-E]\s+(?:Advanced\s+Mathematics\s+and\s+Advanced\s+Physics|Advanced\s+Physics\s+and\s+Mathematics|Mathematics|Physics|Chemistry|Biology)\b/gi,
        "",
      )
      .replace(/Section[s]?\s+\d+|PART\s+[A-Z]/gi, "")
      // trailing subject noise at end of pages
      .replace(
        /\s+(?:\d+\s+)?(?:Mathematics|Physics|Chemistry|Biology)(?:\s+(?:\d+\s+)?(?:Mathematics|Physics|Chemistry|Biology))*\s*$/gi,
        "",
      )
      .replace(/\s+\d+\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Segments page text into question records using numbering + margin heuristics.
 * The thresholds are tuned for ESAT/ENGAA/NSAA layouts, so this favors practical
 * robustness over general-purpose OCR segmentation elegance.
 *
 * @param {PageData[]} pages Page payloads returned from PDF extraction.
 * @param {string} sourceName Source filename or paper identifier.
 * @returns {Question[]} Parsed and cleaned question records.
 */
export function segmentQuestions(
  pages: PageData[],
  sourceName: string,
): Question[] {
  const questions: Question[] = [];

  let currentSection = "";
  let currentPart = "";
  let currentSubject = "";

  let currentQuestion: Question | null = null;
  let lastQuestionNumber = 0;
  let allowSectionRestart = false;

  // crude year extraction from filename
  const yearMatch = sourceName.match(/\d{4}/);
  const year = yearMatch ? Number.parseInt(yearMatch[0], 10) : undefined;

  // Matches question starts like:
  // [X:42]39  OR  [X:42]39)  OR cases where diagram labels sit inline
  const qRegex = /^\[X:(\d+)\](\d+)(?=(?:\s|\.|\)|$|\[X:))/gm;

  // Work out where question numbers *usually* sit horizontally
  const xPositions: number[] = [];

  pages.forEach((page) => {
    let m: RegExpExecArray | null;
    const regex = /^\[X:(\d+)\](\d+)(?:\s|\.|\))/gm;

    while ((m = regex.exec(page.text)) !== null) {
      xPositions.push(Number.parseInt(m[1], 10));
    }
  });

  // crude mode calculation (good enough here)
  const frequentX =
    xPositions.length > 0
      ? [...new Set(xPositions)]
          .sort(
            (a, b) =>
              xPositions.filter((v) => v === a).length -
              xPositions.filter((v) => v === b).length,
          )
          .pop()
      : 0;

  const leftMostX = xPositions.length > 0 ? Math.min(...xPositions) : 0;

  for (const [index, page] of pages.entries()) {
    // skip instruction page if present at start
    if (index === 0 && page.text.toLowerCase().includes("instructions")) {
      continue;
    }

    const text = page.text;

    // detect section / part transitions
    const partWithSubjectMatch = text.match(PART_WITH_SUBJECT_REGEX);
    const partOnlyMatch = text.match(PART_ONLY_REGEX);
    const sectionMatch = text.match(SECTION_REGEX);

    if (partWithSubjectMatch?.[1]) {
      const letter = partWithSubjectMatch[1].toUpperCase();
      const nextSection = `PART ${letter}`;

      if (nextSection !== currentSection) {
        allowSectionRestart = true;
      }

      currentSection = nextSection;
      currentPart = `Part ${letter}`;
      currentSubject = normaliseSubject(partWithSubjectMatch[2]);
    } else if (partOnlyMatch?.[1]) {
      const letter = partOnlyMatch[1].toUpperCase();
      const nextSection = `PART ${letter}`;

      if (nextSection !== currentSection) {
        allowSectionRestart = true;
      }

      currentSection = nextSection;
      currentPart = `Part ${letter}`;

      // NSAA quirk
      if (/nsaa/i.test(sourceName)) {
        currentSubject = inferNsaaSubjectFromPart(letter) ?? currentSubject;
      }
    } else if (sectionMatch?.[1]) {
      const rawSection = sectionMatch[1].toLowerCase();
      const normalisedSection =
        rawSection === "one" ? "1" : rawSection === "two" ? "2" : rawSection;

      const nextSection = `Section ${normalisedSection}`;

      if (nextSection !== currentSection) {
        allowSectionRestart = true;
      }

      currentSection = nextSection;
      currentPart = `Section ${normalisedSection}`;
    }

    let match: RegExpExecArray | null;
    let lastIndex = 0;
    qRegex.lastIndex = 0;

    while ((match = qRegex.exec(text)) !== null) {
      const lineX = Number.parseInt(match[1], 10);
      const qNumStr = match[2];
      const qNum = Number.parseInt(qNumStr, 10);
      const matchIndex = match.index;

      const isIndented = frequentX !== undefined && lineX > frequentX + 15;
      const isAtMargin = lineX <= leftMostX + QUESTION_MARGIN_TOLERANCE;

      const isLogicalNext =
        (lastQuestionNumber === 0 && qNum === 1) ||
        (allowSectionRestart && qNum === 1) ||
        (qNum > lastQuestionNumber &&
          qNum <= lastQuestionNumber + MAX_SEQUENCE_JUMP);

      const isValidNumber = qNum > 0 && qNum < 120;
      const isNoise = Boolean(year && qNum === year);

      if (
        !(isValidNumber && isLogicalNext && isAtMargin && !isIndented) ||
        isNoise
      ) {
        continue;
      }

      // close off previous question
      if (currentQuestion) {
        currentQuestion.text += ` ${text.substring(lastIndex, matchIndex).trim()}`;
        questions.push({ ...currentQuestion });
      }

      currentQuestion = {
        id: `${sourceName}-${currentSection}-${qNum}`.replace(/\s+/g, "-"),
        number: qNumStr,
        text: "",
        page: page.pageNumber,
        section: currentSection || undefined,
        part: currentPart || undefined,
        subject: currentSubject || undefined,
        source: sourceName,
        year,
      };

      lastQuestionNumber = qNum;
      allowSectionRestart = false;
      lastIndex = qRegex.lastIndex;
    }

    // append trailing text chunk
    if (currentQuestion) {
      currentQuestion.text += ` ${text.substring(lastIndex).trim()}`;
    }
  }

  if (currentQuestion?.text) {
    questions.push({ ...currentQuestion });
  }

  // attach images from page data
  const withPageAssets = questions.map((question) => {
    const page = pages.find((p) => p.pageNumber === question.page);

    return {
      ...question,
      image: page?.image,
      year,
    };
  });

  return withPageAssets
    .map((q) => ({
      ...q,
      text: cleanupQuestionText(q.text),
    }))
    .filter((q) => {
      const cleanText = q.text.toLowerCase();

      // allow short ones if diagram present
      const hasEnoughText =
        q.text.length > 30 || (Boolean(q.image) && q.text.length > 12);

      return (
        hasEnoughText &&
        !cleanText.includes("this page is intentionally left blank")
      );
    });
}
