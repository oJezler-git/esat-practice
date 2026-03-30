import { Question } from "../question-segmenter";

export interface RawQuestion extends Question {}

export interface ClassificationResult {
  question_id: string;
  question_text: string;
  primary_topic: string;
  secondary_topics: string[];
  alternative_topics: string[];
  confidence: number;
  ambiguous: boolean;
  uncertainty_score: number;
  verified: boolean;
  model_used: "sonnet" | "opus";
}

export interface PipelineTraceEntry {
  timestamp: string;
  stage: "stage1" | "stage2" | "system";
  model: "sonnet" | "opus" | "none";
  question_ids: string[];
  prompt: string;
  raw_response: string;
  parsed_count: number;
  batch_index?: number;
  batch_total?: number;
  escalated_ids?: string[];
  error?: string;
  note?: string;
}

export interface ClassifiedQuestion extends RawQuestion, ClassificationResult {}

export interface BatchResult {
  results: ClassificationResult[];
  escalation_candidates: string[];
}
