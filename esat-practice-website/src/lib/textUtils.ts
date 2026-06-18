/**
 * Truncates text to a specified limit, ensuring it doesn't cut through a word.
 * Adds an ellipsis if truncation occurred.
 */
export function truncateQuestionText(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }

  // Find the last space before the limit
  let lastSpace = trimmed.lastIndexOf(" ", limit);

  // If no space is found, just cut at the limit
  if (lastSpace === -1) {
    lastSpace = limit;
  }

  return `${trimmed.slice(0, lastSpace).trim()}...`;
}
