import { useState } from "react";
import type { SelfMarkResult } from "../../types/schema";

interface Props {
  correctAnswer: string;
  onMark: (result: SelfMarkResult) => void;
  result?: SelfMarkResult;
}

export function SelfMarkPanel({ correctAnswer, onMark, result }: Props) {
  const [revealed, setRevealed] = useState(Boolean(result));

  if (result) {
    return (
      <div
        className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
          result === "correct"
            ? "border-green-200 bg-green-50"
            : result === "incorrect"
              ? "border-red-200 bg-red-50"
              : "border-gray-200 bg-gray-50"
        }`}
      >
        <span
          className={`text-sm font-medium ${
            result === "correct"
              ? "text-green-700"
              : result === "incorrect"
                ? "text-red-600"
                : "text-gray-400"
          }`}
        >
          {result === "correct"
            ? "Marked correct"
            : result === "incorrect"
              ? "Marked incorrect"
              : "Skipped"}
        </span>
        <span className="selfmark-answer-inline ml-auto">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Correct answer</span>
          <strong className="selfmark-answer-chip">{correctAnswer}</strong>
        </span>
      </div>
    );
  }

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
      >
        Reveal answer
      </button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-wide">Correct answer</span>
        <strong className="selfmark-answer-chip">{correctAnswer}</strong>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-gray-400 mb-3 text-center">Did you get it right?</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onMark("correct")}
            className="py-2.5 rounded-lg border border-green-300 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
          >
            Mark correct
          </button>
          <button
            type="button"
            onClick={() => onMark("incorrect")}
            className="py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            Mark incorrect
          </button>
        </div>
      </div>
    </div>
  );
}
