import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import type { Question } from "../../types/schema";

type SortKey = "default" | "topic" | "year" | "accuracy";
type CountItem = { label: string; count: number };

function buildCountItems(values: Array<string | number | null | undefined>): CountItem[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (value === null || value === undefined) {
      return;
    }
    const label = String(value).trim();
    if (!label) {
      return;
    }
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export default function QuestionBank() {
  const navigate = useNavigate();
  const { questions, availableTopics, availableYears, isLoading, loaded } =
    useQuestionStore();
  const { createSession } = useSessionStore();

  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState<string[]>([]);
  const [yearFilter, setYearFilter] = useState<number[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isQuestionBankLoading = !loaded || isLoading;

  const dataDump = useMemo(() => {
    const verified = questions.filter((question) => question.answer.verified).length;
    const withImage = questions.filter((question) => Boolean(question.content.image_b64)).length;

    const byPrimaryTopic = buildCountItems(
      questions.map((question) => question.taxonomy.primary_topic),
    );
    const bySecondaryTopic = buildCountItems(
      questions.flatMap((question) => question.taxonomy.secondary_topics),
    );
    const byYear = buildCountItems(questions.map((question) => question.source.year));
    const bySubject = buildCountItems(questions.map((question) => question.source.subject));
    const byPaper = buildCountItems(
      questions.map((question) => `${question.source.paper} (${question.source.year})`),
    );
    const byPart = buildCountItems(questions.map((question) => question.source.part));
    const byCorrectAnswer = buildCountItems(
      questions.map((question) => question.answer.correct),
    );
    const byModel = buildCountItems(questions.map((question) => question.taxonomy.model_used));

    return {
      totalQuestions: questions.length,
      verifiedQuestions: verified,
      unverifiedQuestions: Math.max(0, questions.length - verified),
      questionsWithImage: withImage,
      questionsWithoutImage: Math.max(0, questions.length - withImage),
      byPrimaryTopic,
      bySecondaryTopic,
      byYear,
      bySubject,
      byPaper,
      byPart,
      byCorrectAnswer,
      byModel,
    };
  }, [questions]);

  const filtered = useMemo(() => {
    let result = questions;

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.content.text.toLowerCase().includes(term) ||
          item.taxonomy.primary_topic.toLowerCase().includes(term) ||
          item.source.paper.toLowerCase().includes(term),
      );
    }
    if (topicFilter.length > 0) {
      result = result.filter((item) => topicFilter.includes(item.taxonomy.primary_topic));
    }
    if (yearFilter.length > 0) {
      result = result.filter((item) => yearFilter.includes(item.source.year));
    }
    if (verifiedOnly) {
      result = result.filter((item) => item.answer.verified);
    }

    switch (sortKey) {
      case "topic":
        return [...result].sort((left, right) =>
          left.taxonomy.primary_topic.localeCompare(right.taxonomy.primary_topic),
        );
      case "year":
        return [...result].sort((left, right) => right.source.year - left.source.year);
      case "accuracy":
        return [...result].sort(
          (left, right) => right.meta.accuracy_rate - left.meta.accuracy_rate,
        );
      default:
        return result;
    }
  }, [questions, search, sortKey, topicFilter, verifiedOnly, yearFilter]);

  function toggleTopic(topic: string) {
    setTopicFilter((previous) =>
      previous.includes(topic)
        ? previous.filter((value) => value !== topic)
        : [...previous, topic],
    );
  }

  function toggleYear(year: number) {
    setYearFilter((previous) =>
      previous.includes(year)
        ? previous.filter((value) => value !== year)
        : [...previous, year],
    );
  }

  async function drillTopic(topic: string) {
    const ids = questions
      .filter((question) => question.taxonomy.primary_topic === topic)
      .map((question) => question.id);
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-medium">Question bank</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isQuestionBankLoading
              ? "Preparing question bank..."
              : `${filtered.length} of ${questions.length} questions`}
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            type="button"
            onClick={() => {
              void practiceFiltered();
            }}
            disabled={isQuestionBankLoading}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 disabled:cursor-not-allowed shadow"
          >
            Practice these ({Math.min(filtered.length, 40)})
          </button>
        )}
      </div>

      {!isQuestionBankLoading && questions.length > 0 && (
        <details className="mb-6 border border-gray-200 bg-white rounded-xl shadow overflow-hidden">
          <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
            <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Data dump
            </span>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                {dataDump.totalQuestions} total
              </span>
              <span className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                {dataDump.byPrimaryTopic.length} primary topics
              </span>
              <span className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                {dataDump.byYear.length} years
              </span>
            </div>
          </summary>

          <div className="p-4 border-t border-gray-100">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <DataStat label="Total questions" value={dataDump.totalQuestions} />
              <DataStat label="Verified" value={dataDump.verifiedQuestions} />
              <DataStat label="Unverified" value={dataDump.unverifiedQuestions} />
              <DataStat label="With image" value={dataDump.questionsWithImage} />
              <DataStat label="Without image" value={dataDump.questionsWithoutImage} />
              <DataStat label="Years covered" value={dataDump.byYear.length} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DataList title="Primary topic counts" items={dataDump.byPrimaryTopic} />
              <DataList title="Secondary topic counts" items={dataDump.bySecondaryTopic} />
              <DataList title="Year counts" items={dataDump.byYear} />
              <DataList title="Subject counts" items={dataDump.bySubject} />
              <DataList title="Paper counts" items={dataDump.byPaper} />
              <DataList title="Part counts" items={dataDump.byPart} />
              <DataList title="Correct answer counts" items={dataDump.byCorrectAnswer} />
              <DataList title="Model counts" items={dataDump.byModel} />
            </div>
          </div>
        </details>
      )}

      <input
        type="search"
        placeholder="Search questions, topics, papers..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm mb-4 focus:outline-none focus:border-indigo-400"
      />

      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {availableTopics.map((topic) => (
            <button
              type="button"
              key={topic}
              onClick={() => toggleTopic(topic)}
              className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                topicFilter.includes(topic)
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center mb-6">
        <div className="flex gap-1.5">
          {availableYears.map((year) => (
            <button
              type="button"
              key={year}
              onClick={() => toggleYear(year)}
              className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                yearFilter.includes(year)
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              {year}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(event) => setVerifiedOnly(event.target.checked)}
            className="accent-indigo-500"
          />
          Verified only
        </label>

        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-500"
        >
          <option value="default">Default order</option>
          <option value="topic">Sort by topic</option>
          <option value="year">Sort by year</option>
          <option value="accuracy">Sort by accuracy</option>
        </select>
      </div>

      {isQuestionBankLoading && questions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">Preparing question bank...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No questions match your filters.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((question) => (
            <QuestionRow
              key={question.id}
              question={question}
              expanded={expandedId === question.id}
              onToggle={() => setExpandedId(expandedId === question.id ? null : question.id)}
              onDrillTopic={() => {
                void drillTopic(question.taxonomy.primary_topic);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DataStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50">
      <div className="text-base font-medium text-gray-900 tabular-nums">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function DataList({ title, items }: { title: string; items: CountItem[] }) {
  return (
    <details className="border border-gray-200 rounded-lg bg-gray-50">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        <span className="text-xs text-gray-400">{items.length}</span>
      </summary>
      <div className="px-3 pb-3">
        {items.length === 0 ? (
          <p className="text-xs text-gray-400">No data</p>
        ) : (
          <div className="space-y-1" style={{ maxHeight: "9rem", overflowY: "auto" }}>
            {items.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-600">{item.label}</span>
                <span className="text-gray-900 tabular-nums">{item.count}</span>
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
  expanded,
  onToggle,
  onDrillTopic,
}: {
  question: Question;
  expanded: boolean;
  onToggle: () => void;
  onDrillTopic: () => void;
}) {
  const imageSrc = question.content.image_b64
    ? question.content.image_b64.startsWith("data:")
      ? question.content.image_b64
      : `data:image/png;base64,${question.content.image_b64}`
    : undefined;

  return (
    <div className="border border-gray-200 bg-white rounded-lg overflow-hidden shadow">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs text-gray-400 mt-0.5 w-16 flex-shrink-0 font-mono">
          {question.source.year}
        </span>
        <span className="flex-1 text-sm text-gray-700 line-clamp-2">
          {question.content.text.slice(0, 140)}
          {question.content.text.length > 140 ? "..." : ""}
        </span>
        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full flex-shrink-0">
          {question.taxonomy.primary_topic}
        </span>
        {!question.answer.verified && (
          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200 flex-shrink-0">
            unverified
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {question.content.text}
          </p>
          {imageSrc && (
            <img
              src={imageSrc}
              alt="Diagram"
              className="max-h-48 object-contain border rounded"
            />
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {question.taxonomy.secondary_topics.map((topic) => (
              <span
                key={topic}
                className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full"
              >
                {topic}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 pt-1">
            <span>{question.source.paper}</span>
            <span>-</span>
            <span>Page {question.source.page}</span>
            <span>-</span>
            <span>
              Answer: <strong className="text-gray-600">{question.answer.correct}</strong>
            </span>
            <span>-</span>
            <span>Confidence: {Math.round(question.taxonomy.confidence * 100)}%</span>
            <button
              type="button"
              onClick={onDrillTopic}
              className="ml-auto text-indigo-500 hover:text-indigo-700"
            >
              {"Drill this topic ->"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
