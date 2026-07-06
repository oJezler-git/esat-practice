import { useEffect, useRef } from "react";
import { getQuestionImageSrc } from "../../lib/questionImage";
import type { Question } from "../../types/schema";

const BUFFER_SIZE = 2;

/**
 * Warms the browser's image cache for the next few questions so the scan
 * has usually already finished decoding by the time the user navigates to
 * it, instead of only starting the fetch once that question is rendered.
 */
export function useImagePreload(questions: Question[], currentIndex: number): void {
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (let offset = 0; offset <= BUFFER_SIZE; offset += 1) {
      const question = questions[currentIndex + offset];
      if (!question) {
        continue;
      }

      const src = getQuestionImageSrc(question);
      if (!src || preloadedRef.current.has(src)) {
        continue;
      }

      preloadedRef.current.add(src);
      const image = new Image();
      image.src = src;
    }
  }, [questions, currentIndex]);
}
