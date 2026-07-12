import type { Confidence } from "../../store/revisionProgress";
import {
  useRevisionProgress,
  useTopicProgress,
} from "../../store/revisionProgress";

const LEVELS: { value: Confidence; label: string }[] = [
  { value: "shaky", label: "Shaky" },
  { value: "okay", label: "Okay" },
  { value: "solid", label: "Solid" },
];

export function RevisionConfidence({ docId }: { docId: string }) {
  const { confidence } = useTopicProgress(docId);
  const setConfidence = useRevisionProgress((state) => state.setConfidence);

  return (
    <div className="rev-confidence">
      <span className="rev-confidence-label">How solid do you feel?</span>
      <div className="rev-confidence-options" role="group" aria-label="Confidence rating">
        {LEVELS.map((level) => {
          const active = confidence === level.value;
          return (
            <button
              key={level.value}
              type="button"
              // Re-clicking the active level clears the rating.
              onClick={() => setConfidence(docId, active ? null : level.value)}
              aria-pressed={active}
              className={`rev-confidence-btn rev-confidence-btn--${level.value} ${
                active ? "rev-confidence-btn--active" : ""
              }`}
            >
              <span className="rev-confidence-dot" aria-hidden="true" />
              {level.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
