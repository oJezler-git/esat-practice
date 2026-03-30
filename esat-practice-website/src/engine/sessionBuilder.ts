import type { SessionBuildConfig } from "../types/engine";
import type { Question } from "../types/schema";
import { useSettingsStore } from "../lib/settingsStore";
import { DEFAULT_SETTINGS } from "../types/settings";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function matchesTopic(question: Question, topicFilter?: string[]): boolean {
  if (!topicFilter || topicFilter.length === 0) {
    return true;
  }

  const topics = new Set([
    question.taxonomy.primary_topic,
    ...question.taxonomy.secondary_topics,
  ]);
  return topicFilter.some((topic) => topics.has(topic));
}

function matchesYear(question: Question, yearFilter?: number[]): boolean {
  if (!yearFilter || yearFilter.length === 0) {
    return true;
  }
  return yearFilter.includes(question.source.year);
}

function matchesPaper(question: Question, paperFilter?: string[]): boolean {
  if (!paperFilter || paperFilter.length === 0) {
    return true;
  }
  return paperFilter.includes(question.source.paper);
}

export function buildSession(
  questions: Question[],
  config: SessionBuildConfig,
): string[] {
  const currentSettings = useSettingsStore.getState().settings;
  const mode =
    config.mode ?? currentSettings.defaultMode ?? DEFAULT_SETTINGS.defaultMode;
  const questionCount =
    config.question_count ??
    currentSettings.defaultQuestionCount ??
    DEFAULT_SETTINGS.defaultQuestionCount;

  const filtered = questions.filter(
    (question) =>
      matchesTopic(question, config.topic_filter) &&
      matchesYear(question, config.year_filter) &&
      matchesPaper(question, config.paper_filter),
  );

  const ordered =
    mode === "untimed"
      ? [...filtered].sort((left, right) => {
          if (left.source.year !== right.source.year) {
            return left.source.year - right.source.year;
          }
          if (left.source.page !== right.source.page) {
            return left.source.page - right.source.page;
          }
          return left.id.localeCompare(right.id);
        })
      : shuffle(filtered);

  return ordered.slice(0, questionCount).map((question) => question.id);
}
