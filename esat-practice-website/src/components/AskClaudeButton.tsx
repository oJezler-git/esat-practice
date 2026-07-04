import { useEffect, useRef, useState } from "react";
import type { Question } from "../types/schema";
import { askClaudeBasic, askClaudeWithScript, DEFAULT_PROMPT_TEMPLATE } from "../lib/askClaude";
import { useSettingsStore } from "../lib/settingsStore";
import { AskClaudeInfoModal } from "./AskClaudeInfoModal";

interface Props {
  question: Question;
}

type ButtonState = "idle" | "working" | "done" | "error";

export function AskClaudeButton({ question }: Props) {
  const { settings } = useSettingsStore();
  const claudeMode = settings.claudeMode ?? "auto";
  const onboarded = settings.claudeOnboarded ?? false;
  const template = settings.claudePromptTemplate ?? DEFAULT_PROMPT_TEMPLATE;

  const [hasExtension, setHasExtension] = useState(
    () => Boolean((window as unknown as Record<string, unknown>).__esatExtension),
  );
  const [state, setState] = useState<ButtonState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);

  useEffect(() => {
    if (hasExtension) return;
    const handler = () => setHasExtension(true);
    document.addEventListener("esat-extension-ready", handler);
    return () => document.removeEventListener("esat-extension-ready", handler);
  }, [hasExtension]);

  const useExtension =
    claudeMode === "extension" ||
    (claudeMode === "auto" && hasExtension);

  async function handleClick() {
    setState("working");
    setErrorMsg(null);
    try {
      if (useExtension) {
        askClaudeWithScript(question, template, hasExtension);
      } else {
        await askClaudeBasic(question, template);
      }
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : null);
      setState("error");
    } finally {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => { setState("idle"); setErrorMsg(null); }, 4000);
    }
  }

  const label =
    state === "working" ? "Opening…" :
    state === "done" && useExtension ? "Sent to Claude!" :
    state === "done" ? "Paste into Claude" :
    state === "error" ? "Something went wrong" :
    "Ask Claude (Experimental)";

  const sublabel =
    state === "done"  ? (useExtension ? "Extension received — Claude opening" : "Prompt is on your clipboard") :
    state === "error" ? (errorMsg ?? "Try again or paste manually") :
    null;

  return (
    <div className="ask-claude-wrap" data-extension={useExtension ? "true" : undefined}>
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
          ) : useExtension ? (
            <svg className="ask-claude-btn-stars" width="14" height="15" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6.66 1.25C6.77 0.92 7.23 0.92 7.34 1.25L7.99 3.18C8.13 3.61 8.37 4 8.69 4.31C9 4.63 9.39 4.87 9.82 5.01L11.75 5.66C12.08 5.77 12.08 6.23 11.75 6.34L9.82 6.99C9.39 7.13 9 7.37 8.69 7.69C8.37 8 8.13 8.39 7.99 8.82L7.34 10.75C7.32 10.83 7.27 10.89 7.21 10.93C7.15 10.98 7.08 11 7 11C6.92 11 6.85 10.98 6.79 10.93C6.73 10.89 6.68 10.83 6.66 10.75L6.01 8.82C5.87 8.39 5.63 8 5.31 7.69C5 7.37 4.61 7.13 4.18 6.99L2.25 6.34C2.17 6.32 2.11 6.27 2.07 6.21C2.02 6.15 2 6.08 2 6C2 5.92 2.02 5.85 2.07 5.79C2.11 5.73 2.17 5.68 2.25 5.66L4.18 5.01C4.61 4.87 5 4.63 5.31 4.31C5.63 4 5.87 3.61 6.01 3.18L6.66 1.25Z" />
              <path d="M2.39 8.03C2.36 8.06 2.34 8.09 2.33 8.12L2.01 9.09C1.94 9.3 1.82 9.5 1.66 9.66C1.5 9.82 1.3 9.94 1.09 10.01L0.12 10.33C0.09 10.34 0.06 10.36 0.03 10.39C0.01 10.43 0 10.46 0 10.5C0 10.54 0.01 10.58 0.03 10.61C0.06 10.64 0.09 10.66 0.12 10.67L1.09 10.99C1.3 11.06 1.5 11.18 1.66 11.34C1.82 11.5 1.94 11.7 2.01 11.91L2.33 12.88C2.34 12.91 2.36 12.94 2.39 12.97C2.42 12.99 2.46 13 2.5 13C2.54 13 2.58 12.99 2.61 12.97C2.64 12.94 2.66 12.91 2.67 12.88L2.99 11.91C3.06 11.7 3.18 11.5 3.34 11.34C3.5 11.18 3.7 11.06 3.91 10.99L4.88 10.67C4.91 10.66 4.94 10.64 4.97 10.61C4.99 10.58 5 10.54 5 10.5C5 10.46 4.99 10.43 4.97 10.39C4.94 10.36 4.91 10.34 4.88 10.33L3.91 10.01C3.48 9.86 3.14 9.52 2.99 9.09L2.67 8.12C2.66 8.09 2.64 8.06 2.61 8.03C2.58 8.01 2.54 8 2.5 8C2.46 8 2.42 8.01 2.39 8.03Z" />
              <path d="M2.44 0.02C2.42 0.03 2.4 0.05 2.4 0.07L2.2 0.65C2.12 0.91 1.91 1.12 1.65 1.2L1.07 1.4C1.05 1.4 1.03 1.42 1.02 1.44C1.01 1.46 1 1.48 1 1.5C1 1.52 1.01 1.54 1.02 1.56C1.03 1.58 1.05 1.6 1.07 1.6L1.65 1.8C1.78 1.84 1.9 1.91 1.99 2.01C2.09 2.1 2.16 2.22 2.2 2.35L2.4 2.93C2.4 2.95 2.42 2.97 2.44 2.98C2.45 2.99 2.48 3 2.5 3C2.52 3 2.54 2.99 2.56 2.98C2.58 2.97 2.6 2.95 2.6 2.93L2.8 2.35C2.84 2.22 2.91 2.1 3.01 2.01C3.1 1.91 3.22 1.84 3.35 1.8L3.93 1.6C3.95 1.6 3.97 1.58 3.98 1.56C3.99 1.54 4 1.52 4 1.5C4 1.48 3.99 1.46 3.98 1.44C3.97 1.42 3.95 1.4 3.93 1.4L3.35 1.2C3.09 1.12 2.88 0.91 2.8 0.65L2.6 0.07C2.6 0.05 2.58 0.03 2.56 0.02C2.54 0.01 2.52 0 2.5 0C2.48 0 2.45 0.01 2.44 0.02Z" />
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

      {state === "idle" && !useExtension && (
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
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
