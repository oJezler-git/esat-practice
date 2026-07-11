import type { Attempt, Question, Session, SessionConfig } from "../types/schema";

/**
 * Typed test fixtures. Unlike ad-hoc `{...} as any` literals, these fail to
 * compile when the schema in src/types/schema.ts changes, so fixture drift is
 * caught by tsc instead of silently passing stale shapes through tests.
 */

interface QuestionOverrides {
  id?: string;
  source?: Partial<Question["source"]>;
  content?: Partial<Question["content"]>;
  answer?: Partial<Question["answer"]>;
  taxonomy?: Partial<Question["taxonomy"]>;
  meta?: Partial<Question["meta"]>;
}

export function makeQuestion(overrides: QuestionOverrides = {}): Question {
  const id = overrides.id ?? "q1";
  return {
    id,
    source: {
      paper: "ENGAA 2022",
      year: 2022,
      part: "1A",
      subject: "Mathematics",
      page: 1,
      ...overrides.source,
    },
    content: {
      text: `Question text for ${id}`,
      ...overrides.content,
    },
    answer: {
      correct: "A",
      verified: true,
      ...overrides.answer,
    },
    taxonomy: {
      primary_topic: "Algebra",
      secondary_topics: [],
      confidence: 0.9,
      model_used: "test",
      ...overrides.taxonomy,
    },
    meta: {
      times_attempted: 0,
      accuracy_rate: 0,
      ...overrides.meta,
    },
  };
}

type SessionOverrides = Partial<Omit<Session, "config">> & {
  config?: Partial<SessionConfig>;
};

export function makeSession(overrides: SessionOverrides = {}): Session {
  const { config, ...rest } = overrides;
  return {
    id: "session-1",
    created_at: Date.now(),
    mode: "untimed",
    attempt_ids: [],
    state: "active",
    ...rest,
    config: {
      question_ids: ["q1"],
      ...config,
    },
  };
}

export function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "attempt-1",
    question_id: "q1",
    session_id: "session-1",
    result: "correct",
    time_ms: 1000,
    flagged: false,
    timestamp: Date.now(),
    ...overrides,
  };
}
