import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  askRevisionQuestion,
  type RevisionAskTurn,
} from "../../lib/revisionAsk";

// Defer the markdown + KaTeX rendering stack until an answer is shown.
const RevisionMarkdown = lazy(() => import("./RevisionMarkdown"));

const MAX_QUESTION_LENGTH = 400;

function TypewriterText({ text, animate }: { text: string; animate: boolean }) {
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const shouldAnimate = animate && !prefersReduced;

  const [displayed, setDisplayed] = useState(shouldAnimate ? "" : text);
  const indexRef = useRef(shouldAnimate ? 0 : text.length);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayed(text);
      return;
    }

    indexRef.current = 0;
    setDisplayed("");

    const CHARS_PER_TICK = 3;

    function tick() {
      indexRef.current = Math.min(indexRef.current + CHARS_PER_TICK, text.length);
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current < text.length) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, shouldAnimate]);

  return (
    <div className="rev-ask-markdown">
      <Suspense fallback={<p>{displayed}</p>}>
        <RevisionMarkdown>{displayed}</RevisionMarkdown>
      </Suspense>
      {shouldAnimate && displayed.length < text.length && (
        <span className="rev-ask-indicator" aria-hidden="true" />
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "Summarise this page",
  "Explain the fast method",
  "Give me a worked example",
];

export function RevisionAsk({
  moduleSlug,
  topicSlug,
}: {
  moduleSlug: string;
  topicSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<RevisionAskTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Index of the most-recently-added model turn — only that one animates.
  const [animatedTurnIndex, setAnimatedTurnIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, loading]);

  async function submitQuestion(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    const history = turns;
    setTurns((prev) => [...prev, { role: "user", text: trimmed }]);
    setQuestion("");
    setLoading(true);
    setError(null);

    try {
      const answer = await askRevisionQuestion(
        moduleSlug,
        topicSlug,
        trimmed,
        history,
      );
      // history was captured before the user turn was pushed, so:
      // index 0..history.length-1 = prior turns
      // index history.length       = user turn (just added)
      // index history.length + 1   = this model turn
      const modelTurnIndex = history.length + 1;
      setTurns((prev) => [...prev, { role: "model" as const, text: answer }]);
      setAnimatedTurnIndex(modelTurnIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitQuestion(question);
  }

  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          className="rev-ask-fab"
          onClick={() => setOpen(true)}
        >
          Ask AI
        </button>
      )}

      <aside
        className={`rev-ask-drawer ${open ? "rev-ask-drawer--open" : ""}`}
        aria-hidden={!open}
      >
        <div className="rev-ask-drawer-header">
          <span className="rev-ask-drawer-title">AI (free tier — highly rate limited)</span>
          <button
            type="button"
            className="rev-ask-drawer-close"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="rev-ask-drawer-body" ref={scrollRef}>
          {turns.length === 0 ? (
            <div className="rev-ask-empty">
              <p className="rev-ask-empty-title">What can I help you with?</p>
              <p className="rev-ask-empty-hint">
                Answers are generated from this guide only — it will say so if a
                question falls outside it.
              </p>
              <div className="rev-ask-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    className="rev-ask-suggestion"
                    onClick={() => void submitQuestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rev-ask-turns">
              {turns.map((turn, index) => (
                <div
                  key={index}
                  className={`rev-ask-turn rev-ask-turn--${turn.role}`}
                >
                  {turn.role === "model" ? (
                    <TypewriterText
                      text={turn.text}
                      animate={index === animatedTurnIndex}
                    />
                  ) : (
                    <p>{turn.text}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {loading && <p className="rev-ask-loading">Thinking…</p>}
          {error && <p className="rev-ask-error">{error}</p>}
        </div>

        <form className="rev-ask-form" onSubmit={handleSubmit}>
          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value.slice(0, MAX_QUESTION_LENGTH))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitQuestion(question);
              }
            }}
            placeholder="Ask about this page"
            maxLength={MAX_QUESTION_LENGTH}
            rows={1}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            aria-label="Send"
          >
            ↑
          </button>
        </form>
      </aside>
    </>,
    document.body,
  );
}
