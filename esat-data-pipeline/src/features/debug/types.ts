import { ClassificationResult, PipelineTraceEntry } from "../../lib/pipeline/types";
import { Question } from "../../lib/question-segmenter";

export interface ExtractionLogEntry {
  timestamp: string;
  page: number;
  total: number;
  detail: string;
}

export interface ProgressState {
  done: number;
  total: number;
  phase: string;
}

export interface ExportPreviewQuestion extends Question {
  image?: string;
  classification: ClassificationResult | null;
}

export interface QuestionWithResult {
  question: Question;
  result: ClassificationResult | null;
}

export interface PipelineSummary {
  stage1Calls: number;
  stage2Calls: number;
  errors: number;
  escalatedCount: number;
}

export interface ExportSizeEstimates {
  currentBytes: number;
  withImagesBytes: number;
  withoutImagesBytes: number;
}

export interface ExportPreviewStats {
  total: number;
  totalImageBytes: number;
  classified: number;
  answered: number;
  verified: number;
  highUncertainty: number;
  avgConfidence: number;
  topicBreakdown: Array<[string, number]>;
  answerBreakdown: Array<[string, number]>;
}

export interface ExportPayloadQuestion
  extends Omit<ExportPreviewQuestion, "image"> {
  image?: string;
}

export interface ExportPayload {
  version: number;
  exported_at: string;
  file_name: string | null;
  threshold: number;
  dev_first_batch_only: boolean;
  exported_question_count: number;
  answer_key_file: string | null;
  image_settings: {
    scale: number;
    quality: number;
  };
  questions: ExportPayloadQuestion[];
}

export type { ClassificationResult, PipelineTraceEntry, Question };
