import { useTopicProgress } from "../../store/revisionProgress";

const CONFIDENCE_LABEL: Record<string, string> = {
  shaky: "Confidence: shaky",
  okay: "Confidence: okay",
  solid: "Confidence: solid",
};

/**
 * Compact per-topic status shown beside a revision link (sidebar + home):
 * a confidence dot, a done ✓, and a thin read-progress bar. Renders nothing
 * for a topic with no recorded progress.
 */
export function TopicStatusAffix({ docId }: { docId: string }) {
  const { done, confidence, scrollPct } = useTopicProgress(docId);
  const showBar = !done && scrollPct > 0;

  return (
    <span className="rev-status-affix">
      {confidence && (
        <span
          className={`rev-confidence-dot rev-confidence-dot--${confidence}`}
          role="img"
          aria-label={CONFIDENCE_LABEL[confidence]}
        />
      )}
      {done ? (
        <span className="rev-done-check" role="img" aria-label="Done">
          ✓
        </span>
      ) : (
        showBar && (
          <span
            className="rev-read-bar"
            role="img"
            aria-label={`${Math.round(scrollPct)}% read`}
          >
            <span
              className="rev-read-bar-fill"
              style={{ width: `${scrollPct}%` }}
            />
          </span>
        )
      )}
    </span>
  );
}
