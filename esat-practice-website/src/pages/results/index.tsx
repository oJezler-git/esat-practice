import { useEffect, useReducer, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QuestionCard } from "../../components/question/QuestionCard";
import { EsatScorePanel } from "../../components/score-viz/EsatScorePanel";
import { scoreSession } from "../../engine/scorer";
import { useExcludedQuestionStore } from "../../lib/excludedQuestionStore";
import { useQuestionStore } from "../../lib/questionStore";
import { useSessionStore } from "../../lib/sessionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import type { Attempt, Question, Session } from "../../types/schema";

interface ReviewItem {
  question: Question;
  attempt: Attempt;
}

type LoadState = {
  session: Session | null;
  items: ReviewItem[];
  isLoading: boolean;
  autoExcludedCount: number | null;
};

type LoadAction =
  | { type: "load_done"; session: Session; items: ReviewItem[] }
  | { type: "set_auto_excluded"; count: number };

function loadReducer(state: LoadState, action: LoadAction): LoadState {
  switch (action.type) {
    case "load_done":
      return { ...state, isLoading: false, session: action.session, items: action.items };
    case "set_auto_excluded":
      return { ...state, autoExcludedCount: action.count };
    default:
      return state;
  }
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getSession, getAttempts } = useSessionStore();
  const { getQuestionsByIds, questions: allQuestions } = useQuestionStore();
  const { excludeQuestion } = useExcludedQuestionStore();
  const settings = useSettingsStore((state) => state.settings);

  const [loadState, dispatchLoad] = useReducer(loadReducer, {
    session: null,
    items: [],
    isLoading: true,
    autoExcludedCount: null,
  });
  const [reviewMode, setReviewMode] = useState<"all" | "incorrect">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { session, items, isLoading, autoExcludedCount } = loadState;

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!id) {
        navigate("/");
        return;
      }

      const loadedSession = await getSession(id);
      if (!loadedSession) {
        navigate("/");
        return;
      }

      const [attempts, questions] = await Promise.all([
        getAttempts(id),
        getQuestionsByIds(loadedSession.config.question_ids),
      ]);

      const byQuestionId = new Map(
        questions.map((question) => [question.id, question]),
      );
      const orderedQuestions = loadedSession.config.question_ids
        .map((questionId) => byQuestionId.get(questionId))
        .filter((question): question is Question => Boolean(question));

      const responses = Object.fromEntries(
        attempts.map((attempt) => [attempt.question_id, attempt]),
      );
      const scored = scoreSession(orderedQuestions, responses, loadedSession.id);
      const scoredAttemptByQuestionId = new Map(
        scored.attempts.map((attempt) => [attempt.question_id, attempt]),
      );

      const mapped: ReviewItem[] = orderedQuestions.map((question) => ({
        question,
        attempt: scoredAttemptByQuestionId.get(question.id) ?? {
          id: `${loadedSession.id}-${question.id}`,
          question_id: question.id,
          session_id: loadedSession.id,
          result: "skipped",
          time_ms: 0,
          flagged: false,
          timestamp: loadedSession.completed_at ?? loadedSession.created_at,
        },
      }));

      if (!mounted) {
        return;
      }

      dispatchLoad({ type: "load_done", session: loadedSession, items: mapped });

      if (settings.autoExclude) {
        const toExclude = mapped.filter(({ attempt }) => {
          if (settings.autoExcludeOn === "any") return true;
          if (settings.autoExcludeOn === "attempted") return attempt.result !== "skipped";
          return attempt.result === "correct";
        });
        if (toExclude.length > 0) {
          await Promise.all(
            toExclude.map(({ question }) => excludeQuestion(question.id, allQuestions)),
          );
          if (mounted) dispatchLoad({ type: "set_auto_excluded", count: toExclude.length });
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [allQuestions, excludeQuestion, getAttempts, getQuestionsByIds, getSession, id, navigate, settings.autoExclude, settings.autoExcludeOn]);

  const displayItems =
    reviewMode === "incorrect"
      ? items.filter((item) => item.attempt.result === "incorrect")
      : items;

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center h-screen text-muted">
        Loading results...
      </div>
    );
  }

  return (
    <div className="page-shell max-w-3xl">
      {autoExcludedCount !== null && (
        <div className="auto-exclude-notice">
          <span>
            {autoExcludedCount} question{autoExcludedCount !== 1 ? "s" : ""} marked as done and removed from future sessions.
          </span>
          <Link to="/settings">Change</Link>
        </div>
      )}

      <EsatScorePanel items={items} />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-medium text-muted">Review</h2>
        <div className="flex gap-2">
          {(["all", "incorrect"] as const).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setReviewMode(value)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                reviewMode === value
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-subtle text-muted"
              }`}
            >
              {value === "all" ? "All" : "Incorrect only"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 mb-10">
        {displayItems.map(({ question, attempt }, index) => {
          const isCorrect = attempt.result === "correct";
          const isSkipped = attempt.result === "skipped";
          return (
            <div
              key={question.id}
              className={`border rounded-lg overflow-hidden ${
                isCorrect
                  ? "border-success"
                  : isSkipped
                    ? "border-subtle"
                    : "border-danger"
              }`}
            >
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-soft transition-colors"
                onClick={() =>
                  setExpandedId(expandedId === question.id ? null : question.id)
                }
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                    isCorrect
                      ? "bg-success-soft text-success-text"
                      : isSkipped
                        ? "bg-surface-1 text-muted"
                        : "bg-danger-soft text-danger-text"
                  }`}
                >
                  {isCorrect ? "OK" : isSkipped ? "-" : "X"}
                </span>
                <span className="text-sm text-secondary flex-1 line-clamp-2">
                  Q{index + 1}. {question.content.text.slice(0, 120)}
                  {question.content.text.length > 120 ? "..." : ""}
                </span>
                <span className="text-xs text-muted flex-shrink-0">
                  {attempt.result}
                </span>
              </button>

              {expandedId === question.id && (
                <div className="px-4 pb-4 border-t border-subtle">
                  <div className="pt-4">
                    <QuestionCard question={question} />
                    {attempt.result !== "skipped" && (
                      <div
                        className={`mt-4 px-4 py-3 rounded-lg border text-sm flex items-center justify-between ${
                          attempt.result === "correct"
                            ? "border-success bg-success-soft text-success-text"
                            : "border-danger bg-danger-soft text-danger-text"
                        }`}
                      >
                        <span>
                          {attempt.result === "correct"
                            ? "Self-marked correct"
                            : "Self-marked incorrect"}
                        </span>
                        <span className="text-muted">
                          Answer: <strong className="text-secondary">{question.answer.correct}</strong>
                        </span>
                      </div>
                    )}
                    {attempt.result === "skipped" && (
                      <div className="mt-4 px-4 py-3 rounded-lg border border-subtle bg-soft text-sm text-muted flex items-center justify-between">
                        <span>Skipped</span>
                        <span className="text-muted">
                          Answer: <strong className="text-secondary">{question.answer.correct}</strong>
                        </span>
                      </div>
                    )}
                    <div className="mt-3 flex gap-2 text-xs text-muted">
                      <span>{question.taxonomy.primary_topic}</span>
                      <span>-</span>
                      <span>{Math.round(attempt.time_ms / 1000)}s</span>
                      <span>-</span>
                      <span>{question.source.paper}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Link
          to="/practice"
          className="flex-1 py-3 bg-accent text-white rounded-lg font-medium text-center hover:bg-accent-strong transition-colors shadow"
        >
          New session
        </Link>
        <Link
          to="/progress"
          className="flex-1 py-3 border border-subtle rounded-lg font-medium text-center hover:border-strong transition-colors text-secondary"
        >
          View progress
        </Link>
      </div>
    </div>
  );
}
