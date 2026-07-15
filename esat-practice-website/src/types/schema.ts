export type SelfMarkResult = "correct" | "incorrect" | "skipped";

export interface Question {
  id: string;
  source: {
    paper: string;
    year: number;
    part: string;
    subject: string;
    page: number;
  };
  content: {
    text: string;
    /** URL to a separately-served static image asset (preferred). */
    image_url?: string;
    /** Legacy: raw base64-encoded image data (kept for IDB backwards-compat). */
    image_b64?: string;
  };
  answer: {
    correct: string;
    verified: boolean;
  };
  taxonomy: {
    primary_topic: string;
    secondary_topics: string[];
    confidence: number;
    model_used: string;
  };
  meta: {
    difficulty?: number;
    times_attempted: number;
    accuracy_rate: number;
  };
}

export interface Attempt {
  id: string;
  question_id: string;
  session_id: string;
  result: SelfMarkResult;
  time_ms: number;
  flagged: boolean;
  timestamp: number;
}

export type SessionMode = "timed" | "untimed" | "topic" | "mixed";

export interface SessionConfig {
  question_ids: string[];
  question_count?: number;
  time_limit_ms?: number;
  topic_filter?: string[];
  paper_filter?: string[];
  year_filter?: number[];
  /**
   * Session was built from flagged questions only. Recorded so mid-session
   * top-ups (after an exclusion) can honour the same constraint; the other
   * filters alone would let an unflagged question in.
   */
  flagged_only?: boolean;
}

export interface Session {
  id: string;
  created_at: number;
  completed_at?: number;
  mode: SessionMode;
  config: SessionConfig;
  attempt_ids: string[];
  state: "active" | "completed" | "abandoned";
}

export interface TopicStat {
  topic: string;
  attempts: number;
  correct: number;
  accuracy: number;
  ewma_accuracy: number;
  last_attempted: number;
}

/**
 * Dimensions the richer stats model rolls attempts up by (Phase 2). Topics keep
 * their own dedicated {@link TopicStat} store; these are the sibling aggregates:
 * - `subject`  — academic subject (`Question.source.subject`, e.g. "Mathematics")
 * - `program`  — exam programme parsed from the paper ("NSAA" | "ENGAA" | "Other")
 * - `paper`    — individual past paper (`Question.source.paper`)
 */
export type StatDimension = "subject" | "program" | "paper";

/**
 * A per-category accuracy + timing rollup derived from the attempts store. Like
 * {@link TopicStat} but generalised over a {@link StatDimension}, and extended
 * with time-per-question aggregates. Persisted in the `categoryStats` store
 * keyed by the composite {@link CategoryStat.id}.
 */
export interface CategoryStat {
  /** Composite store key: `${dimension}::${key}`. */
  id: string;
  dimension: StatDimension;
  /** The category value (subject name, programme code, or paper id). */
  key: string;
  /** For the `paper` dimension: the exam programme the paper belongs to. */
  program?: string;
  attempts: number;
  correct: number;
  accuracy: number;
  ewma_accuracy: number;
  last_attempted: number;
  /** Sum of answered-question time (ms); the basis for the averages below. */
  total_time_ms: number;
  /** Count of answered (non-skipped) attempts that carried a positive time. */
  timed_attempts: number;
  avg_time_ms: number;
  median_time_ms: number;
}

/**
 * One summary row per completed session, forming a history series that trends
 * can be charted from. Persisted in the `sessionSummaries` store keyed by
 * `session_id`.
 */
export interface SessionSummary {
  session_id: string;
  mode: SessionMode;
  completed_at: number;
  /** Answered (non-skipped) question count. */
  attempts: number;
  correct: number;
  skipped: number;
  accuracy: number;
  total_time_ms: number;
  avg_time_ms: number;
  median_time_ms: number;
}

export interface ExcludedQuestion {
  question_id: string;
  excluded_at: number;
}
