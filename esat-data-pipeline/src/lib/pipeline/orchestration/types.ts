import { ClassificationResult, PipelineTraceEntry, RawQuestion } from "../types";

export interface PipelineHooks {
  onProgress: (done: number, total: number, phase: string) => void;
  onTrace?: (trace: PipelineTraceEntry) => void;
}

export interface Stage1Params extends PipelineHooks {
  batches: RawQuestion[][];
  threshold: number;
  apiKey: string;
  resultById: Map<string, ClassificationResult>;
  escalationQueue: string[];
}

export interface Stage2Params extends PipelineHooks {
  escalationQueue: string[];
  questionById: Map<string, RawQuestion>;
  resultById: Map<string, ClassificationResult>;
  apiKey: string;
}
