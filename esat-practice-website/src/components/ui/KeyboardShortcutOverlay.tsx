import { useEffect, useState } from "react";

const SHORTCUTS = [
  { keys: ["Y"], description: "Mark correct" },
  { keys: ["N"], description: "Mark incorrect" },
  { keys: ["->"], description: "Next question" },
  { keys: ["<-"], description: "Previous question" },
  { keys: ["F"], description: "Flag question" },
  { keys: ["S"], description: "Skip question" },
  { keys: ["?"], description: "Toggle this overlay" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable
  );
}

export function KeyboardShortcutOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "?") {
        setOpen((previous) => !previous);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white border border-gray-100 rounded-xl shadow-xl w-full max-w-sm p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-medium text-gray-900">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none"
            aria-label="Close keyboard shortcut overlay"
          >
            x
          </button>
        </div>

        <div className="space-y-3">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={description} className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-600">{description}</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-0.5 text-xs font-mono bg-gray-100 border border-gray-200 rounded text-gray-700"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-5 text-center">
          Press{" "}
          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 border border-gray-200 rounded">
            Esc
          </kbd>{" "}
          or click outside to close
        </p>
      </div>
    </div>
  );
}
