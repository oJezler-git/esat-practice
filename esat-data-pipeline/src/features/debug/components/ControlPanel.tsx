import { ChangeEventHandler } from "react";
import { DEV_BATCH_SIZE } from "../constants";
import { ExportPreviewStats, ExportSizeEstimates, ProgressState } from "../types";
import { formatBytes } from "../utils";

interface ControlPanelProps {
  onFileInputChange: ChangeEventHandler<HTMLInputElement>;
  onAnswerKeyInputChange: ChangeEventHandler<HTMLInputElement>;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  threshold: number;
  onThresholdChange: (value: number) => void;
  imageScale: number;
  onImageScaleChange: (value: number) => void;
  imageQuality: number;
  onImageQualityChange: (value: number) => void;
  handleClassify: () => void;
  handleExportResultsOnly: () => void;
  handleExportDebugRun: () => void;
  isExtracting: boolean;
  isClassifying: boolean;
  isImportingAnswers: boolean;
  hasQuestions: boolean;
  hasResults: boolean;
  hasFileName: boolean;
  showPageImages: boolean;
  onShowPageImagesChange: (value: boolean) => void;
  includePageImagesInExport: boolean;
  onIncludePageImagesInExportChange: (value: boolean) => void;
  devFirstBatchOnly: boolean;
  onDevFirstBatchOnlyChange: (value: boolean) => void;
  pipelineElapsedSeconds: number;
  extractionProgress: ProgressState;
  pipelineProgress: ProgressState;
  fileName: string | null;
  answerKeyFileName: string | null;
  answerMappingCount: number;
  pagesCount: number;
  questionsCount: number;
  resultsCount: number;
  inScopeCount: number;
  excludedOutOfScopeCount: number;
  extractError: string | null;
  pipelineError: string | null;
  answerImportNote: string;
  exportSizeEstimates: ExportSizeEstimates;
  exportPreviewStats: ExportPreviewStats;
}

export function ControlPanel({
  onFileInputChange,
  onAnswerKeyInputChange,
  apiKey,
  onApiKeyChange,
  threshold,
  onThresholdChange,
  imageScale,
  onImageScaleChange,
  imageQuality,
  onImageQualityChange,
  handleClassify,
  handleExportResultsOnly,
  handleExportDebugRun,
  isExtracting,
  isClassifying,
  isImportingAnswers,
  hasQuestions,
  hasResults,
  hasFileName,
  showPageImages,
  onShowPageImagesChange,
  includePageImagesInExport,
  onIncludePageImagesInExportChange,
  devFirstBatchOnly,
  onDevFirstBatchOnlyChange,
  pipelineElapsedSeconds,
  extractionProgress,
  pipelineProgress,
  fileName,
  answerKeyFileName,
  answerMappingCount,
  pagesCount,
  questionsCount,
  resultsCount,
  inScopeCount,
  excludedOutOfScopeCount,
  extractError,
  pipelineError,
  answerImportNote,
  exportSizeEstimates,
  exportPreviewStats,
}: ControlPanelProps) {
  return (
    <section className="panel controls">
      <div className="control-grid">
        <label>
          PDF file
          <input
            type="file"
            accept="application/pdf"
            onChange={onFileInputChange}
            disabled={isExtracting || isClassifying}
          />
        </label>

        <label>
          Answer key PDF (optional)
          <input
            type="file"
            accept="application/pdf"
            onChange={onAnswerKeyInputChange}
            disabled={isExtracting || isClassifying || isImportingAnswers}
          />
        </label>

        <label>
          Anthropic API key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder="sk-ant-..."
          />
        </label>

        <label>
          Uncertainty threshold
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(event) => onThresholdChange(Number(event.target.value))}
          />
        </label>

        <label>
          Image scale ({imageScale.toFixed(2)}x)
          <input
            type="range"
            min={0.75}
            max={2.5}
            step={0.05}
            value={imageScale}
            onChange={(event) => onImageScaleChange(Number(event.target.value))}
          />
        </label>

        <label>
          Image JPEG quality ({imageQuality.toFixed(2)})
          <input
            type="range"
            min={0.25}
            max={0.95}
            step={0.01}
            value={imageQuality}
            onChange={(event) =>
              onImageQualityChange(Number(event.target.value))
            }
          />
        </label>
      </div>

      <div className="actions">
        <button
          onClick={handleClassify}
          disabled={isExtracting || isClassifying || !hasQuestions}
        >
          {isClassifying ? "Running Pipeline..." : "Run Classification Pipeline"}
        </button>
        <button onClick={handleExportResultsOnly} disabled={!hasResults}>
          Export Results JSON
        </button>
        <button onClick={handleExportDebugRun} disabled={!hasFileName}>
          Export Full Debug JSON
        </button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showPageImages}
            onChange={(event) => onShowPageImagesChange(event.target.checked)}
          />
          show extracted page images
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includePageImagesInExport}
            onChange={(event) =>
              onIncludePageImagesInExportChange(event.target.checked)
            }
          />
          include page images in exported JSON
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={devFirstBatchOnly}
            onChange={(event) => onDevFirstBatchOnlyChange(event.target.checked)}
          />
          dev mode: classify/export only first {DEV_BATCH_SIZE} questions
        </label>
        {isClassifying ? (
          <div className="live-indicator" role="status" aria-live="polite">
            <span className="live-dot" />
            Waiting for model response... elapsed {pipelineElapsedSeconds}s
          </div>
        ) : null}
      </div>

      <p className="muted">
        Answer keys are supported: upload the question PDF first, then upload
        the answer-key PDF. Parsed answers are attached to questions and
        included in export JSON.
      </p>

      <p className="muted">
        Export size estimate: current {formatBytes(exportSizeEstimates.currentBytes)}{" "}
        | with images {formatBytes(exportSizeEstimates.withImagesBytes)} | without
        images {formatBytes(exportSizeEstimates.withoutImagesBytes)}.
      </p>

      <div className="status-grid">
        <div>
          <strong>Source file:</strong> {fileName ?? "none"}
        </div>
        <div>
          <strong>Extraction:</strong> {isExtracting ? "running" : "idle"} |{" "}
          {extractionProgress.phase} ({extractionProgress.done}/
          {extractionProgress.total})
        </div>
        <div>
          <strong>Pipeline:</strong> {isClassifying ? "running" : "idle"} |{" "}
          {pipelineProgress.phase} ({pipelineProgress.done}/{pipelineProgress.total}
          )
        </div>
        <div>
          <strong>Elapsed:</strong> {pipelineElapsedSeconds}s
        </div>
        <div>
          <strong>Answer key:</strong>{" "}
          {isImportingAnswers
            ? "importing..."
            : answerKeyFileName
              ? `${answerKeyFileName} (${answerMappingCount} mapped)`
              : "none"}
        </div>
        <div>
          <strong>Counts:</strong> pages={pagesCount} questions={questionsCount}{" "}
          results={resultsCount}
        </div>
        <div>
          <strong>In scope for LLM:</strong> {inScopeCount} (excluded{" "}
          {excludedOutOfScopeCount})
        </div>
        <div>
          <strong>Image payload:</strong> raw base64 chars=
          {exportPreviewStats.totalImageBytes.toLocaleString()}
        </div>
      </div>

      {extractError && <div className="error">Extraction error: {extractError}</div>}
      {pipelineError && <div className="error">Pipeline error: {pipelineError}</div>}
      {answerImportNote ? <div className="muted">{answerImportNote}</div> : null}
    </section>
  );
}
