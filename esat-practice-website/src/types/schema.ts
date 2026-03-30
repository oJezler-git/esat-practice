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
