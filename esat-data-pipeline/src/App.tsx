import { ControlPanel } from "./features/debug/components/ControlPanel";
import { ExtractionLogsSection } from "./features/debug/components/sections/ExtractionLogsSection";
import { FinalResultsSection } from "./features/debug/components/sections/FinalResultsSection";
import { PipelineTraceSection } from "./features/debug/components/sections/PipelineTraceSection";
import { RawPagesSection } from "./features/debug/components/sections/RawPagesSection";
import { SegmentedQuestionsSection } from "./features/debug/components/sections/SegmentedQuestionsSection";
import { VisualExportPreviewSection } from "./features/debug/components/sections/VisualExportPreviewSection";
import { usePipelineDashboard } from "./features/debug/hooks/usePipelineDashboard";

function App() {
  const dashboard = usePipelineDashboard();

  return (
    <div className="debug-root">
      <ControlPanel
        onFileInputChange={dashboard.onFileInputChange}
        onAnswerKeyInputChange={dashboard.onAnswerKeyInputChange}
        apiKey={dashboard.apiKey}
        onApiKeyChange={dashboard.setApiKey}
        threshold={dashboard.threshold}
        onThresholdChange={dashboard.setThreshold}
        imageScale={dashboard.imageScale}
        onImageScaleChange={dashboard.setImageScale}
        imageQuality={dashboard.imageQuality}
        onImageQualityChange={dashboard.setImageQuality}
        handleClassify={dashboard.handleClassify}
        handleExportResultsOnly={dashboard.handleExportResultsOnly}
        handleExportDebugRun={dashboard.handleExportDebugRun}
        isExtracting={dashboard.isExtracting}
        isClassifying={dashboard.isClassifying}
        isImportingAnswers={dashboard.isImportingAnswers}
        hasQuestions={dashboard.questions.length > 0}
        hasResults={dashboard.results.length > 0}
        hasFileName={Boolean(dashboard.fileName)}
        showPageImages={dashboard.showPageImages}
        onShowPageImagesChange={dashboard.setShowPageImages}
        includePageImagesInExport={dashboard.includePageImagesInExport}
        onIncludePageImagesInExportChange={
          dashboard.setIncludePageImagesInExport
        }
        devFirstBatchOnly={dashboard.devFirstBatchOnly}
        onDevFirstBatchOnlyChange={dashboard.setDevFirstBatchOnly}
        pipelineElapsedSeconds={dashboard.pipelineElapsedSeconds}
        extractionProgress={dashboard.extractionProgress}
        pipelineProgress={dashboard.pipelineProgress}
        fileName={dashboard.fileName}
        answerKeyFileName={dashboard.answerKeyFileName}
        answerMappingCount={Object.keys(dashboard.answerMapping).length}
        pagesCount={dashboard.pages.length}
        questionsCount={dashboard.questions.length}
        resultsCount={dashboard.results.length}
        inScopeCount={dashboard.inScopeQuestions.length}
        excludedOutOfScopeCount={dashboard.excludedOutOfScopeCount}
        extractError={dashboard.extractError}
        pipelineError={dashboard.pipelineError}
        answerImportNote={dashboard.answerImportNote}
        exportSizeEstimates={dashboard.exportSizeEstimates}
        exportPreviewStats={dashboard.exportPreviewStats}
      />

      <ExtractionLogsSection
        extractionLogs={dashboard.extractionLogs}
        visibleExtractionLogs={dashboard.visibleExtractionLogs}
        onShowAll={() =>
          dashboard.setVisibleExtractionLogs(dashboard.extractionLogs.length)
        }
      />

      <RawPagesSection
        pages={dashboard.pages}
        showPageImages={dashboard.showPageImages}
        visibleRawPages={dashboard.visibleRawPages}
        onShowAll={() => dashboard.setVisibleRawPages(dashboard.pages.length)}
      />

      <SegmentedQuestionsSection
        questionsWithResults={dashboard.questionsWithResults}
        visibleSegmentedQuestions={dashboard.visibleSegmentedQuestions}
        onShowAll={() =>
          dashboard.setVisibleSegmentedQuestions(
            dashboard.questionsWithResults.length,
          )
        }
      />

      <VisualExportPreviewSection
        exportedQuestionsBase={dashboard.exportedQuestionsBase}
        exportPayloadPreview={dashboard.exportPayloadPreview}
        exportPreviewStats={dashboard.exportPreviewStats}
      />

      <PipelineTraceSection
        pipelineTrace={dashboard.pipelineTrace}
        pipelineSummary={dashboard.pipelineSummary}
      />

      <FinalResultsSection results={dashboard.results} />
    </div>
  );
}

export default App;
