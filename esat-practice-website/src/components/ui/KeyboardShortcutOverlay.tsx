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
        className="bg-surface-2 border border-subtle rounded-xl shadow-xl w-full max-w-sm p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-medium text-primary">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted hover:text-secondary transition-colors text-lg leading-none"
            aria-label="Close keyboard shortcut overlay"
          >
            x
          </button>
        </div>

        <div className="space-y-3">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={description} className="flex items-center justify-between gap-2">
              <span className="text-sm text-secondary">{description}</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-0.5 text-xs font-mono bg-surface-1 border border-subtle rounded text-secondary"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted mt-5 text-center">
          Press{" "}
          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-surface-1 border border-subtle rounded">
            Esc
          </kbd>{" "}
          or click outside to close
        </p>
      </div>
    </div>
  );
}
