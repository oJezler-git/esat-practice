import type { Question } from "../../types/schema";
import { DiagramViewer } from "./DiagramViewer";
import { getQuestionImageSrc } from "../../lib/questionImage";
import { truncateQuestionText } from "../../lib/textUtils";

interface Props {
  question: Question;
  fontClass?: string;
  showMetadata?: boolean;
}

export function QuestionCard({
  question,
  fontClass = "text-base",
  showMetadata = true,
}: Props) {
  const imageSrc = getQuestionImageSrc(question);

  return (
    <div className="space-y-4 border border-subtle bg-soft rounded-xl p-4">
      {showMetadata && (
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span className="px-2 py-0.5 bg-surface-1 border border-subtle rounded-full">
            {question.taxonomy.primary_topic}
          </span>
          <span className="px-2 py-0.5 bg-surface-1 border border-subtle rounded-full">
            {question.source.paper} {question.source.year}
          </span>
          <span className="px-2 py-0.5 bg-surface-1 border border-subtle rounded-full">
            Confidence {Math.round(question.taxonomy.confidence * 100)}%
          </span>
        </div>
      )}
      <p className={`${fontClass} leading-relaxed text-primary whitespace-pre-wrap`}>
        {truncateQuestionText(question.content.text, 130)}
      </p>
      {imageSrc && <DiagramViewer src={imageSrc} />}
    </div>
  );
}
