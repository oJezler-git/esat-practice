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
  const { getQuestionsByIds, allQuestions } = useQuestionStore();
  const { excludeQuestion } = useExcludedQuestionStore();
  const settings = useSettingsStore((state) => state.settings);

  const [loadState, dispatchLoad] = useReducer(loadReducer, {
    session: null,
    items: [],
    isLoading: true,
    autoExcludedCount: null,
  });
  const [reviewMode, setReviewMode] = useState<"all" | "incorrect" | "flagged">(
    "all",
  );
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

  const flaggedCount = items.filter((item) => item.attempt.flagged).length;
  const reviewSegments: Array<"all" | "incorrect" | "flagged"> =
    flaggedCount > 0 ? ["all", "incorrect", "flagged"] : ["all", "incorrect"];
  const displayItems =
    reviewMode === "incorrect"
      ? items.filter((item) => item.attempt.result === "incorrect")
      : reviewMode === "flagged"
        ? items.filter((item) => item.attempt.flagged)
        : items;

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center h-screen text-muted">
        Loading results...
      </div>
    );
  }

  return (
    <div className="sk-results">
      <div className="sk-frame">
        <span className="sk-screw sk-screw--tl" />
        <span className="sk-screw sk-screw--tr" />
        <span className="sk-screw sk-screw--bl" />
        <span className="sk-screw sk-screw--br" />

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="sk-results-back"
        >
          ← Back
        </button>

        {autoExcludedCount !== null && (
          <div className="auto-exclude-notice">
            <span>
              {autoExcludedCount} question{autoExcludedCount !== 1 ? "s" : ""} marked as done and removed from future sessions.
            </span>
            <Link to="/settings">Change</Link>
          </div>
        )}

        <EsatScorePanel items={items} />

        <div className="sk-results-review-head">
          <div className="sk-results-review-title-group">
            <h2 className="sk-results-review-title">Review</h2>
            {flaggedCount > 0 && (
              <span className="sk-flag-badge">
                {flaggedCount} flagged
              </span>
            )}
          </div>
          <div className="sk-results-toggle">
            {reviewSegments.map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setReviewMode(value)}
                aria-pressed={reviewMode === value}
                className={`sk-results-seg ${
                  reviewMode === value ? "sk-results-seg--active" : ""
                }`}
              >
                {value === "all"
                  ? "All"
                  : value === "incorrect"
                    ? "Incorrect only"
                    : "Flagged"}
              </button>
            ))}
          </div>
        </div>

        <div className="sk-results-list">
          {displayItems.map(({ question, attempt }, index) => {
            const isCorrect = attempt.result === "correct";
            const isSkipped = attempt.result === "skipped";
            const statusMod = isCorrect
              ? "sk-results-dot--correct"
              : isSkipped
                ? "sk-results-dot--skipped"
                : "sk-results-dot--incorrect";
            return (
              <div key={question.id} className="sk-results-item">
                <button
                  type="button"
                  className="sk-results-row"
                  aria-expanded={expandedId === question.id}
                  onClick={() =>
                    setExpandedId(expandedId === question.id ? null : question.id)
                  }
                >
                  <span className={`sk-results-dot ${statusMod}`} />
                  <span className="sk-results-row-text">
                    Q{index + 1}. {question.content.text.slice(0, 120)}
                    {question.content.text.length > 120 ? "…" : ""}
                  </span>
                  <span className="sk-results-row-status">{attempt.result}</span>
                </button>

                {expandedId === question.id && (
                  <div className="sk-results-detail">
                    <QuestionCard question={question} />
                    {attempt.result !== "skipped" && (
                      <div
                        className={`sk-results-verdict ${
                          attempt.result === "correct"
                            ? "sk-results-verdict--correct"
                            : "sk-results-verdict--incorrect"
                        }`}
                      >
                        <span>
                          {attempt.result === "correct"
                            ? "Self-marked correct"
                            : "Self-marked incorrect"}
                        </span>
                        <span className="sk-results-verdict-answer">
                          Answer: <strong>{question.answer.correct}</strong>
                        </span>
                      </div>
                    )}
                    {attempt.result === "skipped" && (
                      <div className="sk-results-verdict sk-results-verdict--skipped">
                        <span>Skipped</span>
                        <span className="sk-results-verdict-answer">
                          Answer: <strong>{question.answer.correct}</strong>
                        </span>
                      </div>
                    )}
                    <div className="sk-results-detail-meta">
                      <span>{question.taxonomy.primary_topic}</span>
                      <span>·</span>
                      <span>{Math.round(attempt.time_ms / 1000)}s</span>
                      <span>·</span>
                      <span>{question.source.paper}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sk-results-actions">
          <Link to="/practice" className="sk-cta">
            <span>New session</span>
          </Link>
          <Link to="/progress" className="sk-tile">
            View progress
          </Link>
        </div>
      </div>
    </div>
  );
}
