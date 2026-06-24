import { useEffect, useState } from "react";
import type { Question } from "../types/schema";
import { askClaudeBasic, askClaudeWithScript, DEFAULT_PROMPT_TEMPLATE } from "../lib/askClaude";
import { useSettingsStore } from "../lib/settingsStore";
import { AskClaudeInfoModal } from "./AskClaudeInfoModal";

interface Props {
  question: Question;
}

type ButtonState = "idle" | "working" | "done" | "error";

export function AskClaudeButton({ question }: Props) {
  const { settings, update } = useSettingsStore();
  const claudeMode = settings.claudeMode ?? "auto";
  const onboarded = settings.claudeOnboarded ?? false;
  const template = settings.claudePromptTemplate ?? DEFAULT_PROMPT_TEMPLATE;

  const [hasExtension, setHasExtension] = useState(false);
  const [state, setState] = useState<ButtonState>("idle");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if ((window as unknown as Record<string, unknown>).__esatExtension) {
      setHasExtension(true);
      return;
    }
    const handler = () => setHasExtension(true);
    document.addEventListener("esat-extension-ready", handler);
    return () => document.removeEventListener("esat-extension-ready", handler);
  }, []);

  const useExtension =
    claudeMode === "extension" ||
    (claudeMode === "auto" && hasExtension);

  async function handleClick() {
    setState("working");
    try {
      if (useExtension) {
        askClaudeWithScript(question, template);
      } else {
        await askClaudeBasic(question, template);
      }
      setState("done");
    } catch {
      setState("error");
    } finally {
      setTimeout(() => setState("idle"), 3000);
    }
  }

  const label =
    state === "working" ? "Opening…" :
    state === "done" && useExtension ? "Sent to Claude!" :
    state === "done" ? "Paste into Claude" :
    state === "error" ? "Something went wrong" :
    "Ask Claude";

  const sublabel =
    state === "done"    ? (useExtension ? "Injected automatically" : "Prompt is on your clipboard") :
    state === "error"   ? "Try again or paste manually" :
    null;

  return (
    <div className="ask-claude-wrap">
      <button
        type="button"
        className="ask-claude-btn"
        data-state={state}
        data-extension={useExtension ? "true" : undefined}
        disabled={!onboarded || state === "working"}
        onClick={() => void handleClick()}
      >
        <span className="ask-claude-btn__icon">
          {state === "done" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : state === "error" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
        </span>

        <span className="ask-claude-btn__body">
          <span className="ask-claude-btn__label">{label}</span>
          {sublabel && <span className="ask-claude-btn__sub">{sublabel}</span>}
        </span>
      </button>

      {state === "idle" && (
        <button
          type="button"
          className="ask-claude-btn__learn-more"
          onClick={() => setShowModal(true)}
        >
          {onboarded ? "How does this work?" : "Read how it works to continue →"}
        </button>
      )}

      {showModal && (
        <AskClaudeInfoModal
          onClose={() => {
            setShowModal(false);
            if (!onboarded) update({ claudeOnboarded: true });
          }}
        />
      )}
    </div>
  );
}
