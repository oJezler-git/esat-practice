import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { getPaperPrefix, parseAnswerKey } from "../../../lib/answer-parser";
import { extractTextFromPDF, PageData } from "../../../lib/pdf-processor";
import { runPipeline } from "../../../lib/pipeline/orchestrator";
import {
  ClassificationResult,
  PipelineTraceEntry,
} from "../../../lib/pipeline/types";
import { Question, segmentQuestions } from "../../../lib/question-segmenter";
import { createLogger } from "../../../lib/logger";
import {
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_SCALE,
  DEFAULT_THRESHOLD,
  DEV_BATCH_SIZE,
  SECTION_PREVIEW_STEP,
} from "../constants";
import {
  ExportPayload,
  ExportPreviewQuestion,
  ExportPreviewStats,
  ExportSizeEstimates,
  ExtractionLogEntry,
  PipelineSummary,
  ProgressState,
  QuestionWithResult,
} from "../types";
import {
  applyAnswerMapping,
  downloadJson,
  isInScopeForClassification,
  normalizePaperPrefix,
  safeFileStem,
} from "../utils";

const log = createLogger("pipeline-dashboard");

export interface PipelineDashboardController {
  apiKey: string;
  threshold: number;
  fileName: string | null;
  isExtracting: boolean;
  isClassifying: boolean;
  extractError: string | null;
  pipelineError: string | null;
  pages: PageData[];
  questions: Question[];
  results: ClassificationResult[];
  extractionLogs: ExtractionLogEntry[];
  pipelineTrace: PipelineTraceEntry[];
  extractionProgress: ProgressState;
  pipelineProgress: ProgressState;
  showPageImages: boolean;
  includePageImagesInExport: boolean;
  isImportingAnswers: boolean;
  answerKeyFileName: string | null;
  answerMapping: Record<string, string>;
  answerImportNote: string;
  devFirstBatchOnly: boolean;
  imageScale: number;
  imageQuality: number;
  pipelineElapsedSeconds: number;
  visibleExtractionLogs: number;
  visibleRawPages: number;
  visibleSegmentedQuestions: number;
  questionsWithResults: QuestionWithResult[];
  inScopeQuestions: Question[];
  excludedOutOfScopeCount: number;
  pipelineSummary: PipelineSummary;
  exportPayloadPreview: ExportPayload;
  exportSizeEstimates: ExportSizeEstimates;
  exportPreviewStats: ExportPreviewStats;
  exportedQuestionsBase: ExportPreviewQuestion[];
  setApiKey: (value: string) => void;
  setThreshold: (value: number) => void;
  setImageScale: (value: number) => void;
  setImageQuality: (value: number) => void;
  setShowPageImages: (value: boolean) => void;
  setIncludePageImagesInExport: (value: boolean) => void;
  setDevFirstBatchOnly: (value: boolean) => void;
  setVisibleExtractionLogs: (value: number) => void;
  setVisibleRawPages: (value: number) => void;
  setVisibleSegmentedQuestions: (value: number) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onAnswerKeyInputChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  handleClassify: () => Promise<void>;
  handleExportResultsOnly: () => void;
  handleExportDebugRun: () => void;
}

export function usePipelineDashboard(): PipelineDashboardController {
  const [apiKey, setApiKeyState] = useState(
    localStorage.getItem("anthropic_api_key") ||
      localStorage.getItem("openai_api_key") ||
      "",
  );
  const [threshold, setThresholdState] = useState(DEFAULT_THRESHOLD);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [extractionLogs, setExtractionLogs] = useState<ExtractionLogEntry[]>(
    [],
  );
  const [pipelineTrace, setPipelineTrace] = useState<PipelineTraceEntry[]>([]);
  const [extractionProgress, setExtractionProgress] = useState<ProgressState>({
    done: 0,
    total: 0,
    phase: "idle",
  });
  const [pipelineProgress, setPipelineProgress] = useState<ProgressState>({
    done: 0,
    total: 0,
    phase: "idle",
  });
  const [showPageImages, setShowPageImages] = useState(false);
  const [includePageImagesInExport, setIncludePageImagesInExport] =
    useState(true);
  const [isImportingAnswers, setIsImportingAnswers] = useState(false);
  const [answerKeyFileName, setAnswerKeyFileName] = useState<string | null>(
    null,
  );
  const [answerMapping, setAnswerMapping] = useState<Record<string, string>>(
    {},
  );
  const [answerImportNote, setAnswerImportNote] = useState<string>("");
  const [devFirstBatchOnly, setDevFirstBatchOnly] = useState(false);
  const [lastRunQuestionIds, setLastRunQuestionIds] = useState<string[]>([]);
  const [imageScale, setImageScale] = useState(DEFAULT_IMAGE_SCALE);
  const [imageQuality, setImageQuality] = useState(DEFAULT_IMAGE_QUALITY);
  const [pipelineElapsedSeconds, setPipelineElapsedSeconds] = useState(0);
  const [visibleExtractionLogs, setVisibleExtractionLogs] =
    useState(SECTION_PREVIEW_STEP);
  const [visibleRawPages, setVisibleRawPages] = useState(SECTION_PREVIEW_STEP);
  const [visibleSegmentedQuestions, setVisibleSegmentedQuestions] =
    useState(SECTION_PREVIEW_STEP);
  const operationIdRef = useRef(0);
  const pipelinePhaseRef = useRef("idle");

  const nextOperationId = () => {
    operationIdRef.current += 1;
    return operationIdRef.current;
  };

  const resultById = useMemo(
    () => new Map(results.map((result) => [result.question_id, result])),
    [results],
  );

  const questionsWithResults = useMemo<QuestionWithResult[]>(
    () =>
      questions.map((question) => ({
        question,
        result: resultById.get(question.id) ?? null,
      })),
    [questions, resultById],
  );

  const inScopeQuestions = useMemo(
    () => questions.filter((question) => isInScopeForClassification(question)),
    [questions],
  );

  const excludedOutOfScopeCount = Math.max(
    0,
    questions.length - inScopeQuestions.length,
  );

  const pipelineSummary = useMemo<PipelineSummary>(() => {
    const stage1Calls = pipelineTrace.filter(
      (entry) => entry.stage === "stage1",
    ).length;
    const stage2Calls = pipelineTrace.filter(
      (entry) => entry.stage === "stage2",
    ).length;
    const errors = pipelineTrace.filter((entry) => entry.error).length;
    const escalated = new Set<string>();
    for (const entry of pipelineTrace) {
      for (const id of entry.escalated_ids ?? []) {
        escalated.add(id);
      }
    }
    return {
      stage1Calls,
      stage2Calls,
      errors,
      escalatedCount: escalated.size,
    };
  }, [pipelineTrace]);

  const exportQuestionIdSet = useMemo(() => {
    if (lastRunQuestionIds.length > 0) {
      return new Set(lastRunQuestionIds);
    }
    if (results.length > 0) {
      return new Set(results.map((result) => result.question_id));
    }
    const candidates = devFirstBatchOnly
      ? questions.slice(0, DEV_BATCH_SIZE)
      : questions;
    return new Set(candidates.map((question) => question.id));
  }, [devFirstBatchOnly, lastRunQuestionIds, questions, results]);

  const exportedQuestionsBase = useMemo<ExportPreviewQuestion[]>(
    () =>
      questions
        .filter((question) => exportQuestionIdSet.has(question.id))
        .map((question) => ({
          ...question,
          image: question.image,
          classification: resultById.get(question.id) ?? null,
        })),
    [exportQuestionIdSet, questions, resultById],
  );

  const exportPayloadWithImages = useMemo<ExportPayload>(
    () => ({
      version: 2,
      exported_at: new Date().toISOString(),
      file_name: fileName,
      threshold,
      dev_first_batch_only: devFirstBatchOnly,
      exported_question_count: exportedQuestionsBase.length,
      answer_key_file: answerKeyFileName,
      image_settings: {
        scale: imageScale,
        quality: imageQuality,
      },
      questions: exportedQuestionsBase.map((question) => ({
        ...question,
        image: question.image,
      })),
    }),
    [
      answerKeyFileName,
      devFirstBatchOnly,
      exportedQuestionsBase,
      fileName,
      imageQuality,
      imageScale,
      threshold,
    ],
  );

  const exportPayloadWithoutImages = useMemo<ExportPayload>(
    () => ({
      ...exportPayloadWithImages,
      questions: exportedQuestionsBase.map((question) => {
        const nextQuestion = { ...question };
        delete nextQuestion.image;
        return nextQuestion;
      }),
    }),
    [exportPayloadWithImages, exportedQuestionsBase],
  );

  const exportPayloadPreview = includePageImagesInExport
    ? exportPayloadWithImages
    : exportPayloadWithoutImages;

  const exportSizeEstimates = useMemo<ExportSizeEstimates>(() => {
    const currentBytes = new Blob([JSON.stringify(exportPayloadPreview)]).size;
    const withImagesBytes = new Blob([JSON.stringify(exportPayloadWithImages)])
      .size;
    const withoutImagesBytes = new Blob([
      JSON.stringify(exportPayloadWithoutImages),
    ]).size;

    return {
      currentBytes,
      withImagesBytes,
      withoutImagesBytes,
    };
  }, [
    exportPayloadPreview,
    exportPayloadWithImages,
    exportPayloadWithoutImages,
  ]);

  const exportPreviewStats = useMemo<ExportPreviewStats>(() => {
    const classified = exportedQuestionsBase.filter((question) =>
      Boolean(question.classification),
    );
    const answered = exportedQuestionsBase.filter((question) =>
      Boolean(question.correctAnswer),
    );
    const verified = classified.filter(
      (question) => question.classification?.verified,
    );
    const highUncertainty = classified.filter(
      (question) =>
        (question.classification?.uncertainty_score ?? 0) > threshold,
    );
    const avgConfidence =
      classified.length > 0
        ? classified.reduce(
            (sum, question) => sum + (question.classification?.confidence ?? 0),
            0,
          ) / classified.length
        : 0;

    const topicCountMap = new Map<string, number>();
    const answerCountMap = new Map<string, number>();

    for (const question of exportedQuestionsBase) {
      const topic = question.classification?.primary_topic ?? "Unclassified";
      topicCountMap.set(topic, (topicCountMap.get(topic) ?? 0) + 1);

      if (question.correctAnswer) {
        answerCountMap.set(
          question.correctAnswer,
          (answerCountMap.get(question.correctAnswer) ?? 0) + 1,
        );
      }
    }

    const topicBreakdown = Array.from(topicCountMap.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const answerBreakdown = Array.from(answerCountMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    return {
      total: exportedQuestionsBase.length,
      totalImageBytes: exportedQuestionsBase.reduce(
        (sum, question) => sum + (question.image ? question.image.length : 0),
        0,
      ),
      classified: classified.length,
      answered: answered.length,
      verified: verified.length,
      highUncertainty: highUncertainty.length,
      avgConfidence,
      topicBreakdown,
      answerBreakdown,
    };
  }, [exportedQuestionsBase, threshold]);

  useEffect(() => {
    if (!isClassifying) {
      if (pipelineElapsedSeconds > 0) {
        log.info("classification-timer:stop", {
          elapsed_seconds: pipelineElapsedSeconds,
        });
      }
      setPipelineElapsedSeconds(0);
      return;
    }

    log.info("classification-timer:start");
    setPipelineElapsedSeconds(0);
    const start = Date.now();
    const timer = window.setInterval(() => {
      setPipelineElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 500);

    return () => window.clearInterval(timer);
  }, [isClassifying]);

  const setApiKey = (value: string) => {
    setApiKeyState(value);
    localStorage.setItem("anthropic_api_key", value);
    log.debug("api-key:updated", {
      has_value: Boolean(value.trim()),
      length: value.length,
    });
  };

  const setThreshold = (value: number) => {
    if (!Number.isFinite(value)) {
      log.warn("threshold:invalid", { received: value });
      return;
    }
    setThresholdState(Math.max(0, Math.min(1, value)));
    log.debug("threshold:updated", {
      received: value,
      applied: Math.max(0, Math.min(1, value)),
    });
  };

  const resetRunState = (nextFileName: string) => {
    log.info("run-state:reset", {
      next_file: nextFileName,
    });
    setFileName(nextFileName);
    setPages([]);
    setQuestions([]);
    setResults([]);
    setAnswerMapping({});
    setAnswerKeyFileName(null);
    setAnswerImportNote("");
    setLastRunQuestionIds([]);
    setExtractionLogs([]);
    setPipelineTrace([]);
    setExtractError(null);
    setPipelineError(null);
    setExtractionProgress({ done: 0, total: 0, phase: "idle" });
    setPipelineProgress({ done: 0, total: 0, phase: "idle" });
    setVisibleExtractionLogs(SECTION_PREVIEW_STEP);
    setVisibleRawPages(SECTION_PREVIEW_STEP);
    setVisibleSegmentedQuestions(SECTION_PREVIEW_STEP);
  };

  const processFile = async (file: File) => {
    const operationId = nextOperationId();
    const operationLog = log.child(`process-file:${operationId}`);
    if (file.type !== "application/pdf") {
      operationLog.warn("rejected-non-pdf", {
        file_name: file.name,
        file_type: file.type,
      });
      setExtractError("Only PDF files are supported.");
      return;
    }

    operationLog.info("start", {
      file_name: file.name,
      file_size_bytes: file.size,
      image_scale: imageScale,
      image_quality: imageQuality,
      has_answer_mapping: Object.keys(answerMapping).length > 0,
    });
    resetRunState(file.name);
    setIsExtracting(true);
    const start = performance.now();

    try {
      const nextPages = await extractTextFromPDF(
        file,
        (page, total, detail) => {
          const entry: ExtractionLogEntry = {
            timestamp: new Date().toISOString(),
            page,
            total,
            detail,
          };
          setExtractionLogs((previous) => [...previous, entry]);
          setExtractionProgress({
            done: page,
            total,
            phase: detail,
          });
          if (page === total || page === 1) {
            operationLog.debug("progress", {
              page,
              total,
              detail,
            });
          }
        },
        {
          includeImages: true,
          imageScale,
          imageQuality,
        },
      );

      const segmented = segmentQuestions(nextPages, file.name);
      const questionsWithAnswers =
        Object.keys(answerMapping).length > 0
          ? applyAnswerMapping(segmented, answerMapping)
          : segmented;
      setPages(nextPages);
      setQuestions(questionsWithAnswers);
      setExtractionProgress({
        done: nextPages.length,
        total: nextPages.length,
        phase: "Extraction and segmentation complete",
      });
      operationLog.info("done", {
        pages: nextPages.length,
        segmented_questions: segmented.length,
        final_questions: questionsWithAnswers.length,
        elapsed_ms: Math.round(performance.now() - start),
      });
    } catch (error) {
      operationLog.error(
        "failed",
        error instanceof Error ? error : undefined,
      );
      setExtractError(
        error instanceof Error ? error.message : "Unknown extraction error",
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      log.debug("file-input:empty-selection");
      return;
    }
    await processFile(file);
  };

  const onAnswerKeyInputChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const operationId = nextOperationId();
    const operationLog = log.child(`import-answer-key:${operationId}`);
    const file = event.target.files?.[0];
    if (!file) {
      operationLog.debug("empty-selection");
      return;
    }
    operationLog.info("start", {
      file_name: file.name,
      file_size_bytes: file.size,
      file_type: file.type,
      has_current_paper: Boolean(fileName),
    });
    if (file.type !== "application/pdf") {
      operationLog.warn("rejected-non-pdf");
      setPipelineError("Answer key upload must be a PDF file.");
      return;
    }

    if (!fileName) {
      operationLog.warn("rejected-no-question-paper");
      setPipelineError(
        "Upload a question paper first, then upload the matching answer key file.",
      );
      event.target.value = "";
      return;
    }

    const questionPrefix = normalizePaperPrefix(fileName);
    const answerPrefix = normalizePaperPrefix(file.name);
    if (questionPrefix !== answerPrefix) {
      operationLog.warn("rejected-prefix-mismatch", {
        expected_prefix: getPaperPrefix(fileName),
        actual_prefix: getPaperPrefix(file.name),
      });
      setPipelineError(
        `Answer key does not match current question paper. Expected prefix "${getPaperPrefix(fileName)}" but got "${getPaperPrefix(file.name)}".`,
      );
      event.target.value = "";
      return;
    }

    setIsImportingAnswers(true);
    setPipelineError(null);
    const start = performance.now();

    try {
      const answerPages = await extractTextFromPDF(file, undefined, {
        includeImages: false,
      });
      const mapping = parseAnswerKey(answerPages);
      const mappingCount = Object.keys(mapping).length;

      setAnswerMapping(mapping);
      setAnswerKeyFileName(file.name);

      if (!questions.length) {
        setAnswerImportNote(
          `Loaded ${mappingCount} answers from "${file.name}". Upload a question paper to apply them.`,
        );
        operationLog.info("loaded-for-later", {
          mapping_count: mappingCount,
          pages: answerPages.length,
          elapsed_ms: Math.round(performance.now() - start),
        });
      } else {
        const withAnswers = applyAnswerMapping(questions, mapping);
        const appliedCount = withAnswers.filter((question) =>
          Boolean(question.correctAnswer),
        ).length;
        setQuestions(withAnswers);
        setAnswerImportNote(
          `Matched "${fileName}" with "${file.name}". Loaded ${mappingCount} answers and applied ${appliedCount} to current questions.`,
        );
        operationLog.info("applied-to-current-questions", {
          mapping_count: mappingCount,
          applied_count: appliedCount,
          page_count: answerPages.length,
          elapsed_ms: Math.round(performance.now() - start),
        });
      }
    } catch (error) {
      operationLog.error(
        "failed",
        error instanceof Error ? error : undefined,
      );
      setPipelineError(
        error instanceof Error
          ? `Answer key import failed: ${error.message}`
          : "Answer key import failed.",
      );
    } finally {
      setIsImportingAnswers(false);
      event.target.value = "";
    }
  };

  const handleClassify = async () => {
    const operationId = nextOperationId();
    const operationLog = log.child(`classify:${operationId}`);
    if (isExtracting || isClassifying) {
      operationLog.warn("blocked-busy", {
        is_extracting: isExtracting,
        is_classifying: isClassifying,
      });
      return;
    }
    if (!questions.length) {
      operationLog.warn("blocked-no-questions");
      setPipelineError(
        "No segmented questions available. Upload and process a PDF first.",
      );
      return;
    }
    if (!apiKey.trim()) {
      operationLog.warn("blocked-no-api-key");
      setPipelineError("Anthropic API key is required to run classification.");
      return;
    }

    operationLog.info("start", {
      question_count: questions.length,
      in_scope_question_count: inScopeQuestions.length,
      threshold,
      dev_first_batch_only: devFirstBatchOnly,
    });
    setPipelineError(null);
    setResults([]);
    setLastRunQuestionIds([]);
    setPipelineTrace([]);
    setPipelineProgress({ done: 0, total: 0, phase: "starting pipeline" });
    setIsClassifying(true);
    pipelinePhaseRef.current = "starting pipeline";
    const start = performance.now();

    try {
      if (!inScopeQuestions.length) {
        operationLog.warn("blocked-no-in-scope-questions");
        setPipelineError(
          "No in-scope maths/physics questions found after NSAA filtering.",
        );
        return;
      }

      const runQuestions = devFirstBatchOnly
        ? inScopeQuestions.slice(0, DEV_BATCH_SIZE)
        : inScopeQuestions;
      setLastRunQuestionIds(runQuestions.map((question) => question.id));
      operationLog.info("pipeline-input-prepared", {
        run_question_count: runQuestions.length,
      });

      const classified = await runPipeline(
        runQuestions,
        apiKey,
        threshold,
        (done, total, phase) => {
          if (phase !== pipelinePhaseRef.current || done === total) {
            pipelinePhaseRef.current = phase;
            operationLog.info("progress", {
              done,
              total,
              phase,
            });
          }
          setPipelineProgress({
            done,
            total,
            phase,
          });
        },
        (trace) => {
          operationLog.debug("trace-entry", {
            stage: trace.stage,
            model: trace.model,
            parsed_count: trace.parsed_count,
            question_count: trace.question_ids.length,
            has_error: Boolean(trace.error),
          });
          setPipelineTrace((previous) => [...previous, trace]);
        },
      );
      setResults(classified);
      setPipelineProgress({
        done: classified.length,
        total: runQuestions.length,
        phase: "pipeline complete",
      });
      operationLog.info("done", {
        result_count: classified.length,
        run_question_count: runQuestions.length,
        elapsed_ms: Math.round(performance.now() - start),
      });
    } catch (error) {
      operationLog.error(
        "failed",
        error instanceof Error ? error : undefined,
      );
      setPipelineError(
        error instanceof Error ? error.message : "Unknown pipeline error",
      );
    } finally {
      setIsClassifying(false);
    }
  };

  const handleExportResultsOnly = () => {
    if (!results.length) {
      log.warn("export-results-only:blocked-no-results");
      return;
    }
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const stem = safeFileStem(fileName ?? "pipeline-run");
    const filename = `${stem}-results-${now}.json`;

    downloadJson(
      {
        ...exportPayloadPreview,
        exported_at: new Date().toISOString(),
      },
      filename,
    );
    log.info("export-results-only:done", {
      file_name: filename,
      questions: exportPayloadPreview.questions.length,
      include_images: includePageImagesInExport,
    });
  };

  const handleExportDebugRun = () => {
    if (!fileName) {
      log.warn("export-debug-run:blocked-no-file");
      return;
    }
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const stem = safeFileStem(fileName);
    const filename = `${stem}-debug-run-${now}.json`;
    const payload = {
      version: 2,
      exported_at: new Date().toISOString(),
      source_file: fileName,
      settings: {
        threshold,
        has_api_key: Boolean(apiKey.trim()),
        include_page_images: includePageImagesInExport,
        image_scale: imageScale,
        image_quality: imageQuality,
      },
      extraction: {
        progress: extractionProgress,
        log_count: extractionLogs.length,
        logs: extractionLogs,
        page_count: pages.length,
        pages: pages.map((page) => ({
          pageNumber: page.pageNumber,
          text: page.text,
          char_count: page.text.length,
          line_count: page.text.split("\n").length,
          image: includePageImagesInExport ? (page.image ?? null) : undefined,
        })),
      },
      segmentation: {
        question_count: questions.length,
        questions,
      },
      classification: {
        progress: pipelineProgress,
        trace_count: pipelineTrace.length,
        trace: pipelineTrace,
        result_count: results.length,
        results,
      },
      answer_key: {
        file_name: answerKeyFileName,
        mapped_answers: answerMapping,
      },
    };

    downloadJson(payload, filename);
    log.info("export-debug-run:done", {
      file_name: filename,
      pages: pages.length,
      questions: questions.length,
      results: results.length,
      trace_entries: pipelineTrace.length,
      include_images: includePageImagesInExport,
    });
  };

  return {
    apiKey,
    threshold,
    fileName,
    isExtracting,
    isClassifying,
    extractError,
    pipelineError,
    pages,
    questions,
    results,
    extractionLogs,
    pipelineTrace,
    extractionProgress,
    pipelineProgress,
    showPageImages,
    includePageImagesInExport,
    isImportingAnswers,
    answerKeyFileName,
    answerMapping,
    answerImportNote,
    devFirstBatchOnly,
    imageScale,
    imageQuality,
    pipelineElapsedSeconds,
    visibleExtractionLogs,
    visibleRawPages,
    visibleSegmentedQuestions,
    questionsWithResults,
    inScopeQuestions,
    excludedOutOfScopeCount,
    pipelineSummary,
    exportPayloadPreview,
    exportSizeEstimates,
    exportPreviewStats,
    exportedQuestionsBase,
    setApiKey,
    setThreshold,
    setImageScale,
    setImageQuality,
    setShowPageImages,
    setIncludePageImagesInExport,
    setDevFirstBatchOnly,
    setVisibleExtractionLogs,
    setVisibleRawPages,
    setVisibleSegmentedQuestions,
    onFileInputChange,
    onAnswerKeyInputChange,
    handleClassify,
    handleExportResultsOnly,
    handleExportDebugRun,
  };
}
