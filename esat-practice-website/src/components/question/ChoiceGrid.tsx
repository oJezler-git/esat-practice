interface Choice {
  label: string;
  text: string;
}

interface Props {
  choices: Choice[];
  selected?: string;
  correct?: string;
  reviewMode?: boolean;
  onSelect?: (label: string) => void;
}

export function ChoiceGrid({
  choices,
  selected,
  correct,
  reviewMode = false,
  onSelect,
}: Props) {
  function getStyle(label: string) {
    if (!reviewMode) {
      return selected === label
        ? "border-indigo-500 bg-indigo-50 text-indigo-800"
        : "border-gray-200 hover:border-gray-300 text-gray-700";
    }

    if (label === correct) {
      return "border-green-400 bg-green-50 text-green-800";
    }
    if (label === selected && label !== correct) {
      return "border-red-400 bg-red-50 text-red-700";
    }
    return "border-gray-100 text-gray-400";
  }

  return (
    <div className="space-y-2">
      {choices.map((choice) => (
        <button
          type="button"
          key={choice.label}
          disabled={reviewMode}
          onClick={() => onSelect?.(choice.label)}
          className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${getStyle(
            choice.label,
          )}`}
        >
          <span className="font-medium text-sm w-5 flex-shrink-0">{choice.label}</span>
          <span className="text-sm leading-relaxed">{choice.text}</span>
        </button>
      ))}
    </div>
  );
}
