import { useState } from "react";

interface Props {
  src: string;
}

export function DiagramViewer({ src }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button
        type="button"
        className="w-full border border-gray-200 rounded-lg overflow-hidden cursor-zoom-in shadow"
        onClick={() => setExpanded(true)}
      >
        <img
          src={src}
          alt="Question diagram"
          className="w-full h-auto max-h-64 object-contain bg-white p-2"
        />
        <div className="text-xs text-gray-400 text-center py-1 bg-gray-50">
          Click to enlarge
        </div>
      </button>

      {expanded && (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <img src={src} alt="Question diagram" className="max-w-full max-h-full object-contain" />
        </button>
      )}
    </>
  );
}
