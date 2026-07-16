import { useEffect, useRef, useState } from "react";
import type { SelfMarkResult } from "../../types/schema";

interface Props {
  correctAnswer: string;
  /** The persisted attempt result, if the question has already been scored. */
  result?: SelfMarkResult;
  /**
   * True once the question is resolved (answered correctly, or given up on),
   * used to restore the answer view when navigating back to it.
   */
  revealed: boolean;
  /**
   * Records the outcome of the very first guess. Only called when no result is
   * stored yet, so retries never overwrite what the first attempt scored.
   */
  onRecordFirst: (result: SelfMarkResult) => void;
  /** Marks the question resolved without recording (a correct guess). */
  onResolve: () => void;
  /** Gives up: reveals the answer and records incorrect if nothing is stored. */
  onGiveUp: () => void;
}

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

export function AnswerInputPanel({
  correctAnswer,
  result,
  revealed,
  onRecordFirst,
  onResolve,
  onGiveUp,
}: Props) {
  const [value, setValue] = useState("");
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  // Local resolution, so a correct guess shows the answer immediately without
  // waiting on the parent's revealed prop to round-trip.
  const [resolved, setResolved] = useState<"correct" | "revealed" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showAnswer = resolved !== null || revealed;
  const wasCorrect = resolved === "correct" || result === "correct";

  useEffect(() => {
    if (!showAnswer) {
      inputRef.current?.focus();
    }
  }, [showAnswer]);

  if (showAnswer) {
    return (
      <div
        className={`answer-input-outcome ${
          wasCorrect ? "answer-input-outcome-correct" : "answer-input-outcome-incorrect"
        }`}
      >
        <div>
          <div className="answer-input-outcome-label">
            {wasCorrect ? "Correct" : "Incorrect"}
          </div>
          <div className="answer-input-outcome-status">
            {wasCorrect ? "Well done" : "Marked incorrect"}
          </div>
        </div>
        <div className="selfmark-answer-hero selfmark-answer-hero-compact ml-auto">
          <span className="selfmark-answer-kicker">Correct answer</span>
          <strong className="selfmark-answer-value">{correctAnswer}</strong>
        </div>
      </div>
    );
  }

  function submitGuess() {
    const guess = normalize(value);
    if (!guess) {
      return;
    }

    const isCorrect = guess === normalize(correctAnswer);
    // Only the first guess scores; later retries never touch the stored result.
    if (!result) {
      onRecordFirst(isCorrect ? "correct" : "incorrect");
    }

    if (isCorrect) {
      setResolved("correct");
      onResolve();
    } else {
      setLastWrong(guess);
      setValue("");
      inputRef.current?.focus();
    }
  }

  function giveUp() {
    setResolved("revealed");
    onGiveUp();
  }

  return (
    <div className="answer-input-panel">
      <p className="answer-input-prompt">Type your answer</p>
      <form
        className="answer-input-row"
        onSubmit={(event) => {
          event.preventDefault();
          submitGuess();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Your answer"
          className="answer-input-field"
        />
        <button type="submit" className="answer-input-check" disabled={!value.trim()}>
          Check
        </button>
      </form>

      {lastWrong && (
        <p className="answer-input-feedback" role="status">
          <strong>{lastWrong}</strong> is not correct — try again.
        </p>
      )}

      <button type="button" onClick={giveUp} className="answer-input-giveup">
        Reveal answer
      </button>
    </div>
  );
}
