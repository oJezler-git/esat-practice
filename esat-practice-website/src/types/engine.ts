import type { Attempt, Question, SelfMarkResult, Session } from "./schema";

export type SessionMode = Session["mode"];

export type SessionStatus =
  | "idle"
  | "configured"
  | "active"
  | "reviewing"
  | "completed"
  | "abandoned";

export interface SessionBuildConfig {
  mode: SessionMode;
  topic_filter?: string[];
  paper_filter?: string[];
  year_filter?: number[];
  question_count: number;
  time_limit_ms?: number;
}

export interface SessionEngineState {
  status: SessionStatus;
  session: Session | null;
  questions: Question[];
  currentIndex: number;
  responses: Record<string, Attempt>;
  timeRemaining?: number;
  questionElapsed: number;
  flagged: Set<string>;
}

export type EngineAction =
  | { type: "START"; config: SessionBuildConfig }
  | { type: "MARK"; question_id: string; result: SelfMarkResult }
  | { type: "FLAG"; question_id: string }
  | { type: "SKIP"; question_id: string }
  | { type: "NAV"; direction: "next" | "prev" }
  | { type: "SUBMIT" }
  | { type: "QUIT" }
  | { type: "TICK"; ms: number };

export interface TopicBreakdownRow {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface ScoringResult {
  attempts: Attempt[];
  topicBreakdown: TopicBreakdownRow[];
}
