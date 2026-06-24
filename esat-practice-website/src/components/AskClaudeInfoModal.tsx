import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  onClose: () => void;
}

export function AskClaudeInfoModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Defer past the triggering click so it doesn't leak onto the backdrop
    const id = requestAnimationFrame(() => { if (!dialog.open) dialog.showModal(); });
    return () => { cancelAnimationFrame(id); if (dialog.open) dialog.close(); };
  }, []);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  function openScript() {
    window.open("/esat-claude-helper.user.js", "_blank", "noopener");
  }

  function goToSettings() {
    onClose();
    navigate("/settings");
  }

  return (
    <dialog
      ref={dialogRef}
      className="ask-claude-modal"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="ask-claude-modal__panel">
        <div className="ask-claude-modal__header">
          <h2 className="ask-claude-modal__title">Ask Claude</h2>
          <button
            type="button"
            className="ask-claude-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ask-claude-modal__body">
        <p className="ask-claude-modal__intro">
          The <strong>Ask Claude</strong> button sends the current question — including the question text and image — to Claude for a detailed explanation. There are two ways to use it.
        </p>

        {/* Option 1: Manual */}
        <div className="ask-claude-modal__option">
          <div className="ask-claude-modal__option-header">
            <span className="ask-claude-modal__badge">Option 1</span>
            <span className="ask-claude-modal__option-title">Copy &amp; Paste — no setup needed</span>
          </div>
          <ol className="ask-claude-modal__steps">
            <li>Click <strong>Ask Claude</strong>. The question prompt is copied to your clipboard and Claude opens in a new tab.</li>
            <li>Paste into Claude's input field (<kbd>Ctrl</kbd>+<kbd>V</kbd> / <kbd>⌘V</kbd>).</li>
            <li>If the question has an image, attach it manually using Claude's file upload.</li>
          </ol>
          <p className="ask-claude-modal__note">Works in any browser, immediately. The image must be attached manually.</p>
        </div>

        {/* Option 2: Extension */}
        <div className="ask-claude-modal__option ask-claude-modal__option--featured">
          <div className="ask-claude-modal__option-header">
            <span className="ask-claude-modal__badge ask-claude-modal__badge--green">Option 2 — Recommended</span>
            <span className="ask-claude-modal__option-title">Tampermonkey extension — fully automatic</span>
          </div>
          <p className="ask-claude-modal__option-desc">
            The question text <em>and</em> image are injected into Claude automatically. No pasting, no manual attachment.
          </p>

          <div className="ask-claude-modal__install-steps">
            <div className="ask-claude-modal__install-step">
              <span className="ask-claude-modal__step-num">1</span>
              <div>
                <div className="ask-claude-modal__step-title">Install Tampermonkey</div>
                <div className="ask-claude-modal__step-links">
                  <a href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo" target="_blank" rel="noopener noreferrer">Chrome</a>
                  <a href="https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/" target="_blank" rel="noopener noreferrer">Firefox</a>
                  <a href="https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd" target="_blank" rel="noopener noreferrer">Edge</a>
                  <a href="https://apps.apple.com/app/tampermonkey/id1482490089" target="_blank" rel="noopener noreferrer">Safari</a>
                </div>
              </div>
            </div>

            <div className="ask-claude-modal__install-step">
              <span className="ask-claude-modal__step-num">2</span>
              <div>
                <div className="ask-claude-modal__step-title">Install the ESAT script</div>
                <div className="ask-claude-modal__step-desc">Tampermonkey will intercept the link and show an install prompt.</div>
                <button
                  type="button"
                  className="ask-claude-modal__install-btn"
                  onClick={openScript}
                >
                  Install script
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" style={{ marginLeft: "0.35rem" }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="ask-claude-modal__install-step">
              <span className="ask-claude-modal__step-num">3</span>
              <div>
                <div className="ask-claude-modal__step-title">Reload this page, then click Ask Claude</div>
                <div className="ask-claude-modal__step-desc">The button will confirm the extension is detected.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ask-claude-modal__footer">
          <button type="button" className="ask-claude-modal__settings-link" onClick={goToSettings}>
            Change your integration preference in Settings →
          </button>
        </div>
        </div>
      </div>
    </dialog>
  );
}
