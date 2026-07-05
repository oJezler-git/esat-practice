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
    <div className="sk-bank">
      <div className="sk-frame">
      <span className="sk-screw sk-screw--tl" />
      <span className="sk-screw sk-screw--tr" />
      <span className="sk-screw sk-screw--bl" />
      <span className="sk-screw sk-screw--br" />
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
        <div className="question-bank-hero-actions">
          <div
            role="tablist"
            aria-label="Question bank scope"
            className="question-bank-scope-toggle"
          >
            <button
              type="button"
              role="tab"
              aria-selected={scope === "practice"}
              onClick={() => setScope("practice")}
              className={`question-bank-scope-tab ${
                scope === "practice" ? "question-bank-scope-tab-active" : ""
              }`}
            >
              Practice bank
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "excluded"}
              onClick={() => setScope("excluded")}
              className={`question-bank-scope-tab question-bank-scope-tab-danger ${
                scope === "excluded" ? "question-bank-scope-tab-danger-active" : ""
              }`}
            >
              Excluded ({excludedQuestions.length})
            </button>
          </div>
          {scope === "practice" && filtered.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void practiceFiltered();
              }}
              disabled={isQuestionBankLoading}
              className="sk-bank-practice-cta"
            >
              <span>Practice these ({Math.min(filtered.length, 40)})</span>
            </button>
          )}
        </div>
      </div>

      {scope === "excluded" && !isQuestionBankLoading && (
        <p className="question-bank-scope-hint mb-6">
          These questions are hidden from practice sessions. Tap{" "}
          <strong>Restore</strong> on a question to bring it back, or switch
          to the <strong>Practice bank</strong> tab above to keep browsing.
        </p>
      )}

      {!isQuestionBankLoading && (
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
        <div className="question-bank-empty">
          Preparing question bank...
        </div>
      ) : filtered.length === 0 ? (
        <div className="question-bank-empty">
          No questions match your filters.
        </div>
      ) : (
        <div
          ref={listRef}
          className="question-bank-list relative"
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
                    onRestore={
                      scope === "excluded"
                        ? () => {
                            void includeQuestion(question.id, allQuestions);
                          }
                        : undefined
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
      className="sk-bank-datadump"
    >
      <summary className="sk-bank-datadump-summary">
        <span className="sk-bank-datadump-title">
          Data dump
        </span>
        <div className="sk-bank-datadump-badges">
          <span className="sk-bank-datadump-badge">
            {totalCount} total
          </span>
          {isDetailsOpen && dataDump && (
            <>
              <span className="sk-bank-datadump-badge">
                {dataDump.byPrimaryTopic.length} primary topics
              </span>
              <span className="sk-bank-datadump-badge">
                {dataDump.byYear.length} years
              </span>
            </>
          )}
        </div>
      </summary>

      {isDetailsOpen && dataDump && (
        <div className="sk-bank-datadump-body">
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
    <details className="sk-bank-datadump mb-6" open>
      <summary className="sk-bank-datadump-summary">
        <span className="sk-bank-datadump-title">
          Dedupe debug
        </span>
        <div className="sk-bank-datadump-badges">
          <span className="sk-bank-datadump-badge">
            {excludedPairs.length} excluded
          </span>
          <span className="sk-bank-datadump-badge">
            {nearMissPairs.length} near miss
          </span>
        </div>
      </summary>

      <div className="sk-bank-datadump-body space-y-4 pt-4">
        <section>
          <h3 className="sk-bank-dedupe-heading mb-2 text-xs font-medium">
            Excluded (NSAA hidden)
          </h3>
          {excludedPairs.length === 0 ? (
            <p className="sk-bank-dedupe-empty text-xs">
              No excluded duplicates found.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {excludedPairs.map((pair) => (
                <div
                  key={pair.nsaaQuestion.id}
                  className="sk-bank-dedupe-card p-3"
                >
                  <div className="sk-bank-dedupe-meta mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono">{pair.nsaaQuestion.id}</span>
                    <span>{"->"}</span>
                    <span className="font-mono">{pair.engaaQuestion.id}</span>
                    <span className="ml-auto">
                      score {formatSimilarity(pair.similarity)} | length ratio{" "}
                      {formatSimilarity(pair.textLengthRatio)}
                    </span>
                  </div>
                  <p className="sk-bank-dedupe-nsaa-text text-xs">
                    <strong className="sk-bank-dedupe-nsaa-label">NSAA:</strong>{" "}
                    {truncateText(pair.nsaaQuestion.content.text)}
                  </p>
                  <p className="sk-bank-dedupe-engaa-text mt-1 text-xs">
                    <strong className="sk-bank-dedupe-engaa-label">ENGAA:</strong>{" "}
                    {truncateText(pair.engaaQuestion.content.text)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="sk-bank-dedupe-heading mb-2 text-xs font-medium">
            Near misses (not excluded)
          </h3>
          {nearMissPairs.length === 0 ? (
            <p className="sk-bank-dedupe-empty text-xs">
              No near misses above debug floor.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {nearMissPairs.map((pair) => (
                <div
                  key={pair.nsaaQuestion.id}
                  className="sk-bank-dedupe-card p-3"
                >
                  <div className="sk-bank-dedupe-meta mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono">{pair.nsaaQuestion.id}</span>
                    <span>{"->"}</span>
                    <span className="font-mono">{pair.engaaQuestion.id}</span>
                    <span className="ml-auto">
                      score {formatSimilarity(pair.similarity)} | length ratio{" "}
                      {formatSimilarity(pair.textLengthRatio)}
                    </span>
                  </div>
                  <p className="sk-bank-dedupe-reason mb-1 text-xs">
                    Reason:{" "}
                    {pair.reason === "similarity_below_threshold"
                      ? "similarity below exclusion threshold"
                      : "length ratio below minimum"}
                  </p>
                  <p className="sk-bank-dedupe-nsaa-text text-xs">
                    <strong className="sk-bank-dedupe-nsaa-label">NSAA:</strong>{" "}
                    {truncateText(pair.nsaaQuestion.content.text)}
                  </p>
                  <p className="sk-bank-dedupe-engaa-text mt-1 text-xs">
                    <strong className="sk-bank-dedupe-engaa-label">ENGAA:</strong>{" "}
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
    <div className="sk-bank-stat px-2.5 py-2">
      <div className="sk-bank-stat-value text-base font-medium tabular-nums">
        {value}
      </div>
      <div className="sk-bank-stat-label text-xs">{label}</div>
    </div>
  );
}

function DataList({ title, items }: { title: string; items: CountItem[] }) {
  return (
    <details className="sk-bank-list">
      <summary className="sk-bank-list-summary px-3 py-2 cursor-pointer flex items-center justify-between gap-2">
        <span className="sk-bank-list-title text-xs font-medium">
          {title}
        </span>
        <span className="sk-bank-list-count text-xs">{items.length}</span>
      </summary>
      <div className="px-3 pb-3">
        {items.length === 0 ? (
          <p className="sk-bank-list-empty text-xs">No data</p>
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
                <span className="sk-bank-list-row-label">{item.label}</span>
                <span className="sk-bank-list-row-count tabular-nums">{item.count}</span>
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
  onRestore,
}: {
  question: Question;
  isExcluded: boolean;
  selected: boolean;
  onToggle: () => void;
  onRestore?: () => void;
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
          {/* fullPracticeBank already excludes excluded questions, so isExcluded
              is only ever true while browsing the excluded scope — safe to swap
              the passive "Excluded" badge for a direct restore action here. */}
          {isExcluded &&
            (onRestore ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onRestore();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    event.preventDefault();
                    onRestore();
                  }
                }}
                className="question-bank-row-warning question-bank-row-restore"
              >
                Restore
              </span>
            ) : (
              <span className="question-bank-row-warning">Excluded</span>
            ))}
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
      className="question-bank-detail-panel sk-bank-detail"
    >
      <div
        className="sk-bank-detail-grid"
        style={imageSrc ? undefined : { gridTemplateColumns: "1fr" }}
      >
        <div
          className="sk-bank-detail-main"
          style={imageSrc ? undefined : { borderRight: "none" }}
        >
          <div className="sk-bank-detail-metarow">
            <span className="sk-bank-metapill sk-bank-metapill--id">{question.id}</span>
            <span className="sk-bank-metapill">{question.source.year}</span>
            <span className="sk-bank-metapill" style={{ color: "var(--sk-bank-tag-text)" }}>
              {question.taxonomy.primary_topic}
            </span>
            <span className="sk-bank-metapill">{question.source.paper}</span>
            <span className="sk-bank-metapill">Page {question.source.page}</span>
            <span className="sk-bank-metapill sk-bank-metapill--answer">
              Answer: <strong>{question.answer.correct}</strong>
            </span>
            <span className="sk-bank-metapill sk-bank-metapill--conf">
              Confidence {Math.round(question.taxonomy.confidence * 100)}%
            </span>
            {!question.answer.verified && (
              <span className="sk-bank-metapill sk-bank-metapill--escalated">
                escalated model
              </span>
            )}
            {isExcluded && (
              <span className="sk-bank-metapill sk-bank-metapill--excluded">excluded</span>
            )}
          </div>

          <p className="sk-bank-detail-text">{question.content.text}</p>

          {question.taxonomy.secondary_topics.length > 0 && (
            <div className="sk-bank-detail-secondary">
              {question.taxonomy.secondary_topics.map((topic) => (
                <span key={topic}>{topic}</span>
              ))}
            </div>
          )}

          <div className="sk-bank-detail-actions">
            <button
              type="button"
              onClick={onDrillTopic}
              disabled={isExcluded}
              className="sk-bank-btn"
            >
              {isExcluded ? "Undo exclusion to drill" : "Drill this topic"}
            </button>
            <button
              type="button"
              onClick={isExcluded ? onInclude : onExclude}
              className={isExcluded ? "sk-bank-btn-success" : "sk-bank-btn-danger"}
            >
              {isExcluded ? "Undo exclusion" : "Exclude"}
            </button>
            <button type="button" onClick={onClose} className="sk-bank-btn-ghost">
              Close
            </button>
          </div>
        </div>

        {imageSrc && (
          <div className="sk-bank-detail-scan">
            <div
              className="sk-bank-detail-paper"
              style={{ maxHeight: isDesktop ? "70vh" : "56vh" }}
            >
              <img src={imageSrc} alt="Diagram" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
