import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { askRevisionQuestion, type RevisionAskTurn } from "../../lib/revisionAsk";

const MAX_QUESTION_LENGTH = 400;

const SUGGESTIONS = [
  "Summarise this page",
  "Explain the fast method",
  "Give me a worked example",
];

export function RevisionAsk({
  moduleSlug,
  topicSlug,
  docId,
  docTitle,
}: {
  moduleSlug: string;
  topicSlug: string;
  docId: string;
  docTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<RevisionAskTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTurns([]);
    setQuestion("");
    setError(null);
    setOpen(false);
  }, [docId]);

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
      const answer = await askRevisionQuestion(moduleSlug, topicSlug, trimmed, history);
      setTurns((prev) => [...prev, { role: "model", text: answer }]);
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
        <button type="button" className="rev-ask-fab" onClick={() => setOpen(true)}>
          Ask AI
        </button>
      )}

      <aside className={`rev-ask-drawer ${open ? "rev-ask-drawer--open" : ""}`} aria-hidden={!open}>
        <div className="rev-ask-drawer-header">
          <span className="rev-ask-drawer-title">{docTitle}</span>
          <button type="button" className="rev-ask-drawer-close" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
        </div>

        <div className="rev-ask-drawer-body" ref={scrollRef}>
          {turns.length === 0 ? (
            <div className="rev-ask-empty">
              <p className="rev-ask-empty-title">What can I help you with?</p>
              <p className="rev-ask-empty-hint">
                Answers are generated from this guide only — it will say so if a question falls outside it.
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
                <div key={index} className={`rev-ask-turn rev-ask-turn--${turn.role}`}>
                  <p>{turn.text}</p>
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
            onChange={(event) => setQuestion(event.target.value.slice(0, MAX_QUESTION_LENGTH))}
            placeholder="Ask about this page"
            maxLength={MAX_QUESTION_LENGTH}
            rows={1}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !question.trim()} aria-label="Send">
            ↑
          </button>
        </form>
      </aside>
    </>,
    document.body,
  );
}
