import { getPaperPrefix } from "../../lib/answer-parser";
import { Question } from "../../lib/question-segmenter";

export function downloadJson(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function safeFileStem(input: string): string {
  return input.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "-");
}

export function normalizePaperPrefix(filename: string): string {
  return getPaperPrefix(filename)
    .replace(/[_\s-]+/g, "")
    .toLowerCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function applyAnswerMapping(
  questions: Question[],
  answerMapping: Record<string, string>,
): Question[] {
  return questions.map((question) => ({
    ...question,
    correctAnswer: answerMapping[question.number] ?? question.correctAnswer,
  }));
}

export function isInScopeForClassification(question: Question): boolean {
  const combined =
    `${question.subject ?? ""} ${question.section ?? ""} ${question.part ?? ""}`.toLowerCase();
  if (combined.includes("chemistry") || combined.includes("biology")) {
    return false;
  }

  if (/nsaa/i.test(question.source)) {
    const nsaaPart =
      `${question.part ?? ""} ${question.section ?? ""}`.toLowerCase();
    if (/\bpart\s*c\b/.test(nsaaPart) || /\bpart\s*d\b/.test(nsaaPart)) {
      return false;
    }
  }

  return true;
}

export function truncateText(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1))}...`;
}
