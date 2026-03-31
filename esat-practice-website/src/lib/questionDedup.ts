import type { Question } from "../types/schema";

type ExamFamily = "ENGAA" | "NSAA";

export interface DuplicateMatchOptions {
  similarityThreshold: number;
  minTextLength: number;
  minLengthRatio: number;
  nearMissSimilarityFloor: number;
  nearMissLimit: number;
}

export const DEFAULT_DUPLICATE_MATCH_OPTIONS: DuplicateMatchOptions = {
  similarityThreshold: 0.9,
  minTextLength: 40,
  minLengthRatio: 0.7,
  nearMissSimilarityFloor: 0.8,
  nearMissLimit: 30,
};

export interface DuplicatePairDebug {
  nsaaQuestion: Question;
  engaaQuestion: Question;
  similarity: number;
  textLengthRatio: number;
  year: number;
  partKey: string;
}

type NearMissReason = "similarity_below_threshold" | "length_ratio_below_min";

export interface DuplicateNearMissDebug extends DuplicatePairDebug {
  reason: NearMissReason;
}

export interface NsaaDuplicateAnalysis {
  hiddenNsaaIds: Set<string>;
  excludedPairs: DuplicatePairDebug[];
  nearMissPairs: DuplicateNearMissDebug[];
}

function detectExamFamily(question: Question): ExamFamily | null {
  const sourceKey = `${question.source.paper} ${question.id}`.toUpperCase();
  if (sourceKey.includes("ENGAA")) {
    return "ENGAA";
  }
  if (sourceKey.includes("NSAA")) {
    return "NSAA";
  }
  return null;
}

function inferPartKey(question: Question): string {
  const explicitPart = question.source.part.trim().toLowerCase();
  if (explicitPart) {
    return explicitPart;
  }

  const idMatch = question.id.match(/PART-([A-Z]+)/i);
  if (idMatch?.[1]) {
    return `part ${idMatch[1].toLowerCase()}`;
  }

  return "unknown";
}

function normaliseForDuplicateMatch(rawText: string): string {
  return rawText
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTrigramProfile(text: string): {
  counts: Map<string, number>;
  total: number;
} {
  const padded = `  ${text}  `;
  const counts = new Map<string, number>();

  for (let index = 0; index < padded.length - 2; index += 1) {
    const gram = padded.slice(index, index + 3);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  return {
    counts,
    total: Math.max(0, padded.length - 2),
  };
}

function trigramDiceSimilarity(
  left: { counts: Map<string, number>; total: number },
  right: { counts: Map<string, number>; total: number },
): number {
  if (left.total === 0 || right.total === 0) {
    return 0;
  }

  let overlap = 0;
  left.counts.forEach((leftCount, gram) => {
    const rightCount = right.counts.get(gram);
    if (!rightCount) {
      return;
    }
    overlap += Math.min(leftCount, rightCount);
  });

  return (2 * overlap) / (left.total + right.total);
}

export function analyseNsaaDuplicates(
  questions: Question[],
  options: DuplicateMatchOptions = DEFAULT_DUPLICATE_MATCH_OPTIONS,
): NsaaDuplicateAnalysis {
  type PreparedQuestion = {
    question: Question;
    year: number;
    partKey: string;
    normalisedText: string;
    profile: { counts: Map<string, number>; total: number };
  };

  const engaaByYearAndPart = new Map<string, PreparedQuestion[]>();
  const nsaaQuestions: PreparedQuestion[] = [];

  questions.forEach((question) => {
    const examFamily = detectExamFamily(question);
    if (!examFamily) {
      return;
    }

    const normalisedText = normaliseForDuplicateMatch(question.content.text);
    if (normalisedText.length < options.minTextLength) {
      return;
    }

    const preparedQuestion: PreparedQuestion = {
      question,
      year: question.source.year,
      partKey: inferPartKey(question),
      normalisedText,
      profile: buildTrigramProfile(normalisedText),
    };

    if (examFamily === "ENGAA") {
      const key = `${preparedQuestion.year}|${preparedQuestion.partKey}`;
      const current = engaaByYearAndPart.get(key) ?? [];
      current.push(preparedQuestion);
      engaaByYearAndPart.set(key, current);
      return;
    }

    nsaaQuestions.push(preparedQuestion);
  });

  const hiddenNsaaIds = new Set<string>();
  const excludedPairs: DuplicatePairDebug[] = [];
  const nearMissPairs: DuplicateNearMissDebug[] = [];

  nsaaQuestions.forEach((nsaaQuestion) => {
    const candidates =
      engaaByYearAndPart.get(`${nsaaQuestion.year}|${nsaaQuestion.partKey}`) ??
      [];

    let bestOverall: DuplicatePairDebug | null = null;
    let bestEligible: DuplicatePairDebug | null = null;

    for (const engaaQuestion of candidates) {
      const maxTextLength = Math.max(
        nsaaQuestion.normalisedText.length,
        engaaQuestion.normalisedText.length,
      );
      if (maxTextLength === 0) {
        continue;
      }

      const minTextLength = Math.min(
        nsaaQuestion.normalisedText.length,
        engaaQuestion.normalisedText.length,
      );
      const textLengthRatio = minTextLength / maxTextLength;

      const similarity = trigramDiceSimilarity(
        nsaaQuestion.profile,
        engaaQuestion.profile,
      );

      const currentPair: DuplicatePairDebug = {
        nsaaQuestion: nsaaQuestion.question,
        engaaQuestion: engaaQuestion.question,
        similarity,
        textLengthRatio,
        year: nsaaQuestion.year,
        partKey: nsaaQuestion.partKey,
      };

      if (!bestOverall || currentPair.similarity > bestOverall.similarity) {
        bestOverall = currentPair;
      }

      if (textLengthRatio < options.minLengthRatio) {
        continue;
      }

      if (!bestEligible || currentPair.similarity > bestEligible.similarity) {
        bestEligible = currentPair;
      }
    }

    if (
      bestEligible &&
      bestEligible.similarity >= options.similarityThreshold
    ) {
      hiddenNsaaIds.add(nsaaQuestion.question.id);
      excludedPairs.push(bestEligible);
      return;
    }

    if (
      bestEligible &&
      bestEligible.similarity >= options.nearMissSimilarityFloor
    ) {
      nearMissPairs.push({
        ...bestEligible,
        reason: "similarity_below_threshold",
      });
      return;
    }

    if (
      bestOverall &&
      bestOverall.similarity >= options.nearMissSimilarityFloor &&
      bestOverall.textLengthRatio < options.minLengthRatio
    ) {
      nearMissPairs.push({
        ...bestOverall,
        reason: "length_ratio_below_min",
      });
    }
  });

  excludedPairs.sort((left, right) => right.similarity - left.similarity);
  nearMissPairs.sort((left, right) => right.similarity - left.similarity);

  return {
    hiddenNsaaIds,
    excludedPairs,
    nearMissPairs: nearMissPairs.slice(0, options.nearMissLimit),
  };
}

export function findNsaaDuplicateIds(
  questions: Question[],
  options: DuplicateMatchOptions = DEFAULT_DUPLICATE_MATCH_OPTIONS,
): Set<string> {
  return analyseNsaaDuplicates(questions, options).hiddenNsaaIds;
}
