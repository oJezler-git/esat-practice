import { QuestionWithResult } from "../../types";
import { JsonPanel } from "../JsonPanel";
import { SectionPanel } from "../SectionPanel";

interface SegmentedQuestionsSectionProps {
  questionsWithResults: QuestionWithResult[];
  visibleSegmentedQuestions: number;
  onShowAll: () => void;
}

export function SegmentedQuestionsSection({
  questionsWithResults,
  visibleSegmentedQuestions,
  onShowAll,
}: SegmentedQuestionsSectionProps) {
  return (
    <SectionPanel
      title="Segmented Questions"
      hint={`${questionsWithResults.length} questions`}
      defaultOpen={questionsWithResults.length > 0}
    >
      <p className="muted section-subtitle">
        Each entry includes parsed question text and classifier output (when
        available).
      </p>
      {questionsWithResults.length === 0 ? (
        <p className="muted">No segmented questions available.</p>
      ) : (
        <>
          <div className="stack">
            {questionsWithResults
              .slice(0, visibleSegmentedQuestions)
              .map((item) => (
                <details key={item.question.id} className="json-panel">
                  <summary>
                    Q{item.question.number} | id={item.question.id} | page=
                    {item.question.page} | classified=
                    {item.result ? "yes" : "no"}
                  </summary>
                  <JsonPanel title="Question Object" data={item.question} />
                  {item.result ? (
                    <JsonPanel title="Classification Result" data={item.result} />
                  ) : null}
                </details>
              ))}
          </div>
          {visibleSegmentedQuestions < questionsWithResults.length ? (
            <div className="overlay-more-wrap">
              <div className="overlay-fade-tail" />
              <button className="overlay-more-button" onClick={onShowAll}>
                Show more...
              </button>
            </div>
          ) : null}
        </>
      )}
    </SectionPanel>
  );
}
