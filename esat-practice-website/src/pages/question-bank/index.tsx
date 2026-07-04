import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  type DuplicateNearMissDebug,
  type DuplicatePairDebug,
} from "../../lib/questionDedup";
import { useExcludedQuestionStore } from "../../lib/excludedQuestionStore";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import type { Question } from "../../types/schema";
import type { CountItem, DataDump, SortKey } from "./useQuestionBankFilters";
import { useQuestionBankFilters } from "./useQuestionBankFilters";
import { useVirtualQuestionList } from "./useVirtualQuestionList";

export default function QuestionBank() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTopicFilter = useMemo(() => {
    const topic = searchParams.get("topic")?.trim();
    return topic ? [topic] : [];
  }, [searchParams]);
  const {
    allQuestions,
    fullPracticeBank,
    excludedQuestions,
    excludedQuestionIds,
    availableTopics,
    availableYears,
    isLoading,
    loaded,
    nsaaDuplicateAnalysis,
  } =
    useQuestionStore();
  const { createSession } = useSessionStore();
  const { excludeQuestion, includeQuestion } = useExcludedQuestionStore();

  const {
    search, scope, topicFilter, yearFilter, verifiedOnly, hideNsaaDuplicates, showDedupDebug, sortKey, isDetailsOpen,
    setSearch, setScope, toggleTopic, toggleYear, setVerifiedOnly, setHideDupes, setDebug, setSort, setDetailsOpen,
    sourceQuestions, visibleQuestions, filtered, dataDump, hiddenNsaaDuplicateCount, duplicateAnalysis,
  } = useQuestionBankFilters({ fullPracticeBank, excludedQuestions, nsaaDuplicateAnalysis, initialTopicFilter });

  const {
    listRef, cardHeight, rowGap, rowHeight, isAnimating, expandedId, setExpanded, handleDetailHeightChange,
    selectedQuestion, selectedIndex, detailBlockHeight, dynamicTotalHeight, startIndex, virtualSlice,
  } = useVirtualQuestionList(filtered);

  const isQuestionBankLoading = !loaded || isLoading;

  async function drillTopic(topic: string) {
    const ids = visibleQuestions.flatMap((question) =>
      question.taxonomy.primary_topic === topic ? [question.id] : [],
    );
    if (ids.length === 0) {
      return;
    }
    const session = await createSession({
      mode: "topic",
      question_ids: ids,
      topic_filter: [topic],
      question_count: ids.length,
    });
    navigate(`/session/${session.id}`);
  }

  async function practiceFiltered() {
    const ids = filtered.map((question) => question.id).slice(0, 40);
    if (ids.length === 0) {
      return;
    }
    const session = await createSession({
      mode: "mixed",
      question_ids: ids,
      question_count: ids.length,
    });
    navigate(`/session/${session.id}`);
  }

  return (
    <div className="page-shell question-bank-page max-w-4xl">
      <div className="question-bank-hero">
        <div className="question-bank-hero-copy">
          <h1 className="page-title">Question bank</h1>
          <p className="question-bank-subtitle">
            {isQuestionBankLoading
              ? "Preparing question bank..."
              : `${filtered.length} of ${visibleQuestions.length} ${
                  scope === "excluded" ? "excluded questions" : "practice questions"
                }${
                  scope === "practice" && hideNsaaDuplicates && hiddenNsaaDuplicateCount > 0
                    ? ` (${hiddenNsaaDuplicateCount} NSAA duplicates hidden)`
                    : ""
                }`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setScope("practice")}
            className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              scope === "practice"
                ? "bg-slate-900 text-white"
                : "border border-slate-300 text-slate-600 hover:border-slate-400"
            }`}
          >
            Practice bank
          </button>
          <button
            type="button"
            onClick={() => setScope("excluded")}
            className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              scope === "excluded"
                ? "bg-rose-600 text-white"
                : "border border-danger text-danger-text hover:border-strong"
            }`}
          >
            Excluded ({excludedQuestions.length})
          </button>
          {scope === "practice" && filtered.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void practiceFiltered();
              }}
              disabled={isQuestionBankLoading}
              className="question-bank-practice btn-primary text-sm shadow disabled:cursor-not-allowed disabled:opacity-50"
            >
              Practice these ({Math.min(filtered.length, 40)})
            </button>
          )}
        </div>
      </div>

      {!isQuestionBankLoading && sourceQuestions.length > 0 && (
        <DataDumpPanel
          totalCount={sourceQuestions.length}
          isDetailsOpen={isDetailsOpen}
          onToggle={(open) => setDetailsOpen(open)}
          dataDump={dataDump}
        />
      )}

      <section className="question-bank-controls">
        <input
          type="search"
          aria-label="Search questions"
          placeholder="Search questions, topics, papers..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="question-bank-search"
        />

        <div className="question-bank-filter-section">
          <p className="question-bank-filter-label">Topics</p>
          <div className="question-bank-chip-grid">
          {availableTopics.map((topic) => (
            <button
              type="button"
              key={topic}
              onClick={() => toggleTopic(topic)}
              className={`question-bank-chip ${
                topicFilter.includes(topic)
                  ? "question-bank-chip-active"
                  : "question-bank-chip-idle"
              }`}
            >
              {topic}
            </button>
          ))}
          </div>
        </div>

        <div className="question-bank-filter-section">
          <div className="question-bank-filter-row">
            <div className="question-bank-filter-block">
              <p className="question-bank-filter-label">Years</p>
              <div className="question-bank-chip-grid question-bank-chip-grid-compact">
          {availableYears.map((year) => (
            <button
              type="button"
              key={year}
              onClick={() => toggleYear(year)}
              className={`question-bank-chip ${
                yearFilter.includes(year)
                  ? "question-bank-chip-active"
                  : "question-bank-chip-idle"
              }`}
            >
              {year}
            </button>
          ))}
              </div>
            </div>

            <div className="question-bank-tools">
              <div className="question-bank-toggles">
                {scope === "practice" && (
                  <label className="question-bank-toggle">
                    <input
                      type="checkbox"
                      checked={hideNsaaDuplicates}
                      onChange={(event) => setHideDupes(event.target.checked)}
                      className="accent-accent"
                    />
                    Exclude NSAA duplicates
                  </label>
                )}

                <label className="question-bank-toggle">
                  <input
                    type="checkbox"
                    checked={verifiedOnly}
                    onChange={(event) => setVerifiedOnly(event.target.checked)}
                    className="accent-indigo-500"
                  />
                  Primary-model only
                </label>

                <label className="question-bank-toggle">
                  <input
                    type="checkbox"
                    checked={showDedupDebug}
                    onChange={(event) => setDebug(event.target.checked)}
                    className="accent-indigo-500"
                  />
                  Dedupe debug
                </label>
              </div>

              <select
                value={sortKey}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="question-bank-sort"
              >
                <option value="default">Default order</option>
                <option value="topic">Sort by topic</option>
                <option value="year">Sort by year</option>
                <option value="accuracy">Sort by accuracy</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {showDedupDebug && !isQuestionBankLoading && (
        <DuplicateDebugPanel
          excludedPairs={duplicateAnalysis.excludedPairs}
          nearMissPairs={duplicateAnalysis.nearMissPairs}
        />
      )}

      {isQuestionBankLoading && allQuestions.length === 0 ? (
        <div className="py-20 text-center text-slate-500">
          Preparing question bank...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-slate-500">
          No questions match your filters.
        </div>
      ) : (
        <div
          ref={listRef}
          className="question-bank-list relative rounded-lg"
        >
          <div style={{ height: dynamicTotalHeight, position: "relative" }}>
            {virtualSlice.map((question, offset) => {
              const index = startIndex + offset;
              return (
                <div
                  key={question.id}
                  className={
                    isAnimating
                      ? "question-bank-virtual-row is-animating"
                      : "question-bank-virtual-row"
                  }
                  style={{
                    position: "absolute",
                    top:
                      index * rowHeight +
                      (selectedQuestion &&
                      selectedIndex >= 0 &&
                      index > selectedIndex
                        ? detailBlockHeight
                        : 0),
                    left: 0,
                    right: 0,
                  }}
                >
                  <QuestionRow
                    question={question}
                    isExcluded={excludedQuestionIds.has(question.id)}
                    selected={expandedId === question.id}
                    onToggle={() =>
                      setExpanded(expandedId === question.id ? null : question.id)
                    }
                  />
                </div>
              );
            })}
            {selectedQuestion && selectedIndex >= 0 && (
              <div
                style={{
                  position: "absolute",
                  top: selectedIndex * rowHeight + cardHeight + rowGap,
                  left: 0,
                  right: 0,
                  zIndex: 20,
                }}
              >
                <QuestionDetailPanel
                  question={selectedQuestion}
                  isExcluded={excludedQuestionIds.has(selectedQuestion.id)}
                  onClose={() => setExpanded(null)}
                  onHeightChange={handleDetailHeightChange}
                  onDrillTopic={() => {
                    void drillTopic(selectedQuestion.taxonomy.primary_topic);
                  }}
                  onExclude={() => {
                    void excludeQuestion(selectedQuestion.id, allQuestions);
                  }}
                  onInclude={() => {
                    void includeQuestion(selectedQuestion.id, allQuestions);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatSimilarity(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function truncateText(value: string, maxLength = 150): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

function DataDumpPanel({
  totalCount,
  isDetailsOpen,
  onToggle,
  dataDump,
}: {
  totalCount: number;
  isDetailsOpen: boolean;
  onToggle: (open: boolean) => void;
  dataDump: DataDump | null;
}) {
  return (
    <details
      open={isDetailsOpen}
      onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}
      className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_40px_rgb(0_0_0_/_0.2)] backdrop-blur-sm"
    >
      <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
        <span className="text-sm font-medium text-slate-300">
          Data dump
        </span>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-400">
            {totalCount} total
          </span>
          {isDetailsOpen && dataDump && (
            <>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-400">
                {dataDump.byPrimaryTopic.length} primary topics
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-400">
                {dataDump.byYear.length} years
              </span>
            </>
          )}
        </div>
      </summary>

      {isDetailsOpen && dataDump && (
        <div className="border-t border-white/10 p-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <DataStat
              label="Total questions"
              value={dataDump.totalQuestions}
            />
            <DataStat label="Verified" value={dataDump.verifiedQuestions} />
            <DataStat
              label="Escalated classifications"
              value={dataDump.unverifiedQuestions}
            />
            <DataStat
              label="With image"
              value={dataDump.questionsWithImage}
            />
            <DataStat
              label="Without image"
              value={dataDump.questionsWithoutImage}
            />
            <DataStat label="Years covered" value={dataDump.byYear.length} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DataList
              title="Primary topic counts"
              items={dataDump.byPrimaryTopic}
            />
            <DataList
              title="Secondary topic counts"
              items={dataDump.bySecondaryTopic}
            />
            <DataList title="Year counts" items={dataDump.byYear} />
            <DataList title="Subject counts" items={dataDump.bySubject} />
            <DataList title="Paper counts" items={dataDump.byPaper} />
            <DataList title="Part counts" items={dataDump.byPart} />
            <DataList
              title="Correct answer counts"
              items={dataDump.byCorrectAnswer}
            />
            <DataList title="Model counts" items={dataDump.byModel} />
          </div>
        </div>
      )}
    </details>
  );
}

function DuplicateDebugPanel({
  excludedPairs,
  nearMissPairs,
}: {
  excludedPairs: DuplicatePairDebug[];
  nearMissPairs: DuplicateNearMissDebug[];
}) {
  return (
    <details
      className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_40px_rgb(0_0_0_/_0.2)] backdrop-blur-sm"
      open
    >
      <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
        <span className="text-sm font-medium text-slate-300">
          Dedupe debug
        </span>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-400">
            {excludedPairs.length} excluded
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-400">
            {nearMissPairs.length} near miss
          </span>
        </div>
      </summary>

      <div className="space-y-4 border-t border-white/10 p-4">
        <section>
          <h3 className="mb-2 text-xs font-medium text-slate-300">
            Excluded (NSAA hidden)
          </h3>
          {excludedPairs.length === 0 ? (
            <p className="text-xs text-slate-500">
              No excluded duplicates found.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {excludedPairs.map((pair) => (
                <div
                  key={pair.nsaaQuestion.id}
                  className="rounded-xl border border-white/10 bg-black/10 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono">{pair.nsaaQuestion.id}</span>
                    <span>{"->"}</span>
                    <span className="font-mono">{pair.engaaQuestion.id}</span>
                    <span className="ml-auto">
                      score {formatSimilarity(pair.similarity)} | length ratio{" "}
                      {formatSimilarity(pair.textLengthRatio)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200">
                    <strong>NSAA:</strong>{" "}
                    {truncateText(pair.nsaaQuestion.content.text)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    <strong>ENGAA:</strong>{" "}
                    {truncateText(pair.engaaQuestion.content.text)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium text-slate-300">
            Near misses (not excluded)
          </h3>
          {nearMissPairs.length === 0 ? (
            <p className="text-xs text-slate-500">
              No near misses above debug floor.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {nearMissPairs.map((pair) => (
                <div
                  key={pair.nsaaQuestion.id}
                  className="rounded-xl border border-white/10 bg-black/10 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono">{pair.nsaaQuestion.id}</span>
                    <span>{"->"}</span>
                    <span className="font-mono">{pair.engaaQuestion.id}</span>
                    <span className="ml-auto">
                      score {formatSimilarity(pair.similarity)} | length ratio{" "}
                      {formatSimilarity(pair.textLengthRatio)}
                    </span>
                  </div>
                  <p className="mb-1 text-xs text-amber-300">
                    Reason:{" "}
                    {pair.reason === "similarity_below_threshold"
                      ? "similarity below exclusion threshold"
                      : "length ratio below minimum"}
                  </p>
                  <p className="text-xs text-slate-200">
                    <strong>NSAA:</strong>{" "}
                    {truncateText(pair.nsaaQuestion.content.text)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    <strong>ENGAA:</strong>{" "}
                    {truncateText(pair.engaaQuestion.content.text)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </details>
  );
}

function DataStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
      <div className="text-base font-medium tabular-nums text-slate-100">
        {value}
      </div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function DataList({ title, items }: { title: string; items: CountItem[] }) {
  return (
    <details className="rounded-xl border border-white/10 bg-black/10">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">
          {title}
        </span>
        <span className="text-xs text-slate-500">{items.length}</span>
      </summary>
      <div className="px-3 pb-3">
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">No data</p>
        ) : (
          <div
            className="space-y-1"
            style={{ maxHeight: "9rem", overflowY: "auto" }}
          >
            {items.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-slate-400">{item.label}</span>
                <span className="tabular-nums text-slate-100">{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function QuestionRow({
  question,
  isExcluded,
  selected,
  onToggle,
}: {
  question: Question;
  isExcluded: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const preview = truncateText(question.content.text.replace(/\s+/g, " "), 180);

  return (
    <div
      className={`question-bank-row rounded-2xl overflow-hidden transition-colors ${
        selected
          ? "question-bank-row-selected"
          : "question-bank-row-idle"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="question-bank-row-button"
      >
        <span className="question-bank-row-year">
          {question.source.year}
        </span>
        <span className="question-bank-row-preview">
          {preview}
        </span>
        <span className="question-bank-row-meta">
          <span className="question-bank-row-tag">
            {question.taxonomy.primary_topic}
          </span>
          {isExcluded && (
            <span className="question-bank-row-warning">
              Excluded
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

function QuestionDetailPanel({
  question,
  isExcluded,
  onClose,
  onHeightChange,
  onDrillTopic,
  onExclude,
  onInclude,
}: {
  question: Question;
  isExcluded: boolean;
  onClose: () => void;
  onHeightChange: (height: number) => void;
  onDrillTopic: () => void;
  onExclude: () => void;
  onInclude: () => void;
}) {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 960);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const updateIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 960);
    };

    window.addEventListener("resize", updateIsDesktop);
    return () => {
      window.removeEventListener("resize", updateIsDesktop);
    };
  }, []);

  useEffect(() => {
    const element = panelRef.current;
    if (!element) {
      return;
    }

    const syncHeight = () => {
      onHeightChange(element.offsetHeight);
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onHeightChange, question.id, isDesktop]);

  const imageSrc =
    question.content.image_url ??
    (question.content.image_b64
      ? question.content.image_b64.startsWith("data:")
        ? question.content.image_b64
        : `data:image/png;base64,${question.content.image_b64}`
      : undefined);

  return (
    <section
      ref={panelRef}
      className="question-bank-detail-panel overflow-hidden rounded-2xl border border-white/10 bg-[#121816] shadow-[0_24px_50px_rgb(0_0_0_/_0.28)]"
    >
        <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="font-mono text-xs text-slate-500">{question.id}</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400">
            {question.source.year}
          </span>
          <span className="rounded-full border border-[color:var(--accent)]/40 bg-[rgb(154_178_124_/_0.14)] px-2 py-0.5 text-xs text-[color:var(--accent-strong)]">
            {question.taxonomy.primary_topic}
          </span>
          {!question.answer.verified && (
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
              escalated model
            </span>
          )}
          {isExcluded && (
            <span className="rounded-full border border-danger bg-danger-soft px-2 py-0.5 text-xs text-danger-text">
              excluded
            </span>
          )}
          <button
            type="button"
            onClick={isExcluded ? onInclude : onExclude}
            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              isExcluded
                ? "border-success text-success-text hover:bg-success-soft"
                : "border-danger text-danger-text hover:bg-danger-soft"
            }`}
          >
            {isExcluded ? "Undo exclusion" : "Exclude"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5"
          >
            Close
          </button>
        </header>

        <div className="p-4 h-[calc(100%-3.25rem)] overflow-y-auto">
          <div
            className={imageSrc && !isDesktop ? "space-y-4" : ""}
            style={
              imageSrc && isDesktop
                ? {
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                    gap: "1rem",
                    alignItems: "start",
                  }
                : undefined
            }
          >
            <div className="space-y-3 min-w-0">
              <p className="text-sm leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
                {question.content.text}
              </p>
              <div className="flex flex-wrap gap-2">
                {question.taxonomy.secondary_topics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400"
                  >
                    {topic}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                  {question.source.paper}
                </span>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                  Page {question.source.page}
                </span>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                  Answer: <strong className="text-slate-100">{question.answer.correct}</strong>
                </span>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                  Confidence: {Math.round(question.taxonomy.confidence * 100)}%
                </span>
                <button
                  type="button"
                  onClick={onDrillTopic}
                  disabled={isExcluded}
                  className="ml-auto text-[color:var(--accent-strong)] hover:text-[color:var(--accent)] disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  {isExcluded ? "Undo exclusion to drill" : "Drill this topic"}
                </button>
              </div>
            </div>
            {imageSrc && (
              <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/10 p-2">
                <div
                  className="overflow-auto rounded-lg border border-white/10 bg-[#0d1210]"
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    height: isDesktop ? "70vh" : "56vh",
                    minHeight: isDesktop ? "28rem" : "20rem",
                    overflowX: "hidden",
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch",
                    touchAction: "pan-y",
                  }}
                >
                  <img
                    src={imageSrc}
                    alt="Diagram"
                    className="h-auto block"
                    style={{
                      width: "100%",
                      minWidth: "100%",
                      maxWidth: "100%",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
  );
}
