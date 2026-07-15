import type { SessionBuildConfig, SessionMode } from "../types/engine";
import type { Question } from "../types/schema";
import { useSettingsStore } from "../lib/settingsStore";
import { DEFAULT_SETTINGS } from "../types/settings";
import { shuffle } from "../lib/shuffle";

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

function matchesFilters(question: Question, config: SessionBuildConfig): boolean {
  return (
    matchesTopic(question, config.topic_filter) &&
    matchesYear(question, config.year_filter) &&
    matchesPaper(question, config.paper_filter)
  );
}

function orderQuestions(questions: Question[], mode: SessionMode): Question[] {
  return mode === "untimed"
    ? [...questions].sort((left, right) => {
        if (left.source.year !== right.source.year) {
          return left.source.year - right.source.year;
        }
        if (left.source.page !== right.source.page) {
          return left.source.page - right.source.page;
        }
        return left.id.localeCompare(right.id);
      })
    : shuffle(questions);
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

  const filtered = questions.filter((question) => matchesFilters(question, config));
  const ordered = orderQuestions(filtered, mode);

  return ordered.slice(0, questionCount).map((question) => question.id);
}

/**
 * Picks questions to top a session back up after some were excluded mid-session,
 * so the total stays as configured. Candidates honour the session's original
 * filters and skip anything already used (in the session or excluded).
 */
export function pickReplacementQuestions(
  questions: Question[],
  config: SessionBuildConfig,
  usedIds: Set<string>,
  count: number,
): Question[] {
  if (count <= 0) {
    return [];
  }

  const mode =
    config.mode ??
    useSettingsStore.getState().settings.defaultMode ??
    DEFAULT_SETTINGS.defaultMode;
  const candidates = questions.filter(
    (question) => !usedIds.has(question.id) && matchesFilters(question, config),
  );

  return orderQuestions(candidates, mode).slice(0, count);
}
