import type { Question } from "../types/schema";

/** Resolves a question's scan image to a renderable `src`, preferring the
 * static URL over the legacy embedded base64. */
export function getQuestionImageSrc(question: Question): string | undefined {
  if (question.content.image_url) {
    return question.content.image_url;
  }
  if (!question.content.image_b64) {
    return undefined;
  }
  return question.content.image_b64.startsWith("data:")
    ? question.content.image_b64
    : `data:image/png;base64,${question.content.image_b64}`;
}
