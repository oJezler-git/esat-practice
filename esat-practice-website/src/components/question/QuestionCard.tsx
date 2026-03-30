import type { Question } from "../../types/schema";
import { DiagramViewer } from "./DiagramViewer";

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
  const imageSrc = question.content.image_b64
    ? question.content.image_b64.startsWith("data:")
      ? question.content.image_b64
      : `data:image/png;base64,${question.content.image_b64}`
    : undefined;

  return (
    <div className="space-y-4 border border-gray-200 bg-white rounded-xl p-4 shadow">
      {showMetadata && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">
            {question.taxonomy.primary_topic}
          </span>
          <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">
            {question.source.paper} {question.source.year}
          </span>
          <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">
            Confidence {Math.round(question.taxonomy.confidence * 100)}%
          </span>
        </div>
      )}
      <p className={`${fontClass} leading-relaxed text-gray-900 whitespace-pre-wrap`}>
        {question.content.text}
      </p>
      {imageSrc && <DiagramViewer src={imageSrc} />}
    </div>
  );
}
