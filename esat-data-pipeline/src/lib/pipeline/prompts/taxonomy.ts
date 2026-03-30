import { ESAT_TAXONOMY } from "../../taxonomy";

interface TaxonomyTopic {
  module: string;
  topic: string;
  definition: string;
}

function getTaxonomyTopics(): TaxonomyTopic[] {
  return Object.entries(ESAT_TAXONOMY).flatMap(([moduleName, moduleTopics]) =>
    Object.entries(moduleTopics).map(([topic, definition]) => ({
      module: moduleName,
      topic,
      definition,
    })),
  );
}

const TAXONOMY_TOPICS = getTaxonomyTopics();

export const ESAT_TOPIC_NAMES = TAXONOMY_TOPICS.map((entry) => entry.topic);

/**
 * Flattens the taxonomy into a stable plain-text block for prompts.
 * Keeping this deterministic helps diff prompt traces across runs.
 *
 * @returns {string} Prompt-ready taxonomy list.
 */
export function serialiseTaxonomy(): string {
  return TAXONOMY_TOPICS.map(
    (entry) => `- [${entry.module}] ${entry.topic}: ${entry.definition}`,
  ).join("\n");
}
