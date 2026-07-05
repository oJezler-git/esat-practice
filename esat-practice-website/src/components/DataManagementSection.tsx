import { useReducer } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  clearAllData,
  clearProgressData,
  generateConfirmationPhrase,
} from "../lib/dataManagement";

type Message = { type: "success" | "error"; text: string } | null;

type DataMgmtState = {
  showClearAllModal: boolean;
  showClearProgressModal: boolean;
  confirmationPhrase: string;
  userInput: string;
  isClearing: boolean;
  message: Message;
};

type DataMgmtAction =
  | { type: "open_clear_all"; phrase: string }
  | { type: "close_clear_all" }
  | { type: "open_clear_progress" }
  | { type: "close_clear_progress" }
  | { type: "update_input"; value: string }
  | { type: "clear_start" }
  | { type: "clear_error"; error: string }
  | { type: "set_message"; message: Message };

function dataMgmtReducer(state: DataMgmtState, action: DataMgmtAction): DataMgmtState {
  switch (action.type) {
    case "open_clear_all":
      return { ...state, showClearAllModal: true, confirmationPhrase: action.phrase, userInput: "", message: null };
    case "close_clear_all":
      return { ...state, showClearAllModal: false, confirmationPhrase: "", userInput: "", message: null };
    case "open_clear_progress":
      return { ...state, showClearProgressModal: true, message: null };
    case "close_clear_progress":
      return { ...state, showClearProgressModal: false, message: null };
    case "update_input":
      return { ...state, userInput: action.value, message: null };
    case "clear_start":
      return { ...state, isClearing: true };
    case "clear_error":
      return { ...state, isClearing: false, message: { type: "error", text: action.error } };
    case "set_message":
      return { ...state, message: action.message };
    default:
      return state;
  }
}

export function DataManagementSection() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(dataMgmtReducer, {
    showClearAllModal: false,
    showClearProgressModal: false,
    confirmationPhrase: "",
    userInput: "",
    isClearing: false,
    message: null,
  });

  const { showClearAllModal, showClearProgressModal, confirmationPhrase, userInput, isClearing, message } = state;

  function openClearAllModal() {
    dispatch({ type: "open_clear_all", phrase: generateConfirmationPhrase() });
  }

  async function handleClearAll() {
    if (userInput !== confirmationPhrase) {
      dispatch({ type: "set_message", message: { type: "error", text: "Confirmation phrase does not match" } });
      return;
    }

    dispatch({ type: "clear_start" });
    try {
      await clearAllData();
      dispatch({ type: "set_message", message: { type: "success", text: "All data cleared. Reloading..." } });
      setTimeout(() => {
        navigate("/");
        window.location.reload();
      }, 1500);
    } catch (error) {
      dispatch({ type: "clear_error", error: `Error: ${error instanceof Error ? error.message : "Unknown error"}` });
    }
  }

  async function handleClearProgress() {
    dispatch({ type: "clear_start" });
    try {
      await clearProgressData();
      dispatch({ type: "set_message", message: { type: "success", text: "Progress data cleared. Reloading..." } });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      dispatch({ type: "clear_error", error: `Error: ${error instanceof Error ? error.message : "Unknown error"}` });
    }
  }

  return (
    <>
      <section className="mb-8 border border-subtle rounded-xl bg-soft overflow-hidden shadow">
        <div className="px-4 py-3.5 border-b border-subtle">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
            Data Management
          </h2>
          <p className="text-xs text-muted mt-1">
            Delete cached data and your progress history.
          </p>
        </div>

        <div className="divide-y divide-subtle">
          {/* Clear Progress */}
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-secondary">
                Clear Progress
              </p>
              <p className="text-xs text-muted mt-1">
                Remove sessions, stats, and question cache
              </p>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "open_clear_progress" })}
              disabled={isClearing}
              className="px-3 py-1.5 text-sm border border-warning text-amber rounded-lg hover:bg-amber-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>

          {/* Clear All */}
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-secondary">Clear All</p>
              <p className="text-xs text-muted mt-1">
                Delete everything including settings (start from scratch)
              </p>
            </div>
            <button
              type="button"
              onClick={openClearAllModal}
              disabled={isClearing}
              className="px-3 py-1.5 text-sm border border-danger text-danger-text rounded-lg hover:bg-danger-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      {/* Clear All Confirmation Modal */}
      {showClearAllModal &&
        createPortal(
          <div className="sk-confirm-backdrop">
            <div className="sk-confirm-panel">
              <div className="sk-confirm-header">
                <h3 className="sk-confirm-title">Clear everything?</h3>
                <p className="sk-confirm-desc">
                  This will delete all your data, including settings. This
                  action cannot be undone.
                </p>
              </div>

              <div className="sk-confirm-body">
                <p>
                  Type the following to confirm:{" "}
                  <span className="sk-confirm-phrase">{confirmationPhrase}</span>
                </p>
                <input
                  type="text"
                  aria-label="Confirmation phrase"
                  value={userInput}
                  onChange={(e) => dispatch({ type: "update_input", value: e.target.value })}
                  placeholder="Type confirmation phrase..."
                  className="sk-confirm-input"
                />

                {message && (
                  <div
                    className={`sk-confirm-message ${
                      message.type === "success" ? "sk-confirm-message--success" : "sk-confirm-message--error"
                    }`}
                  >
                    {message.text}
                  </div>
                )}
              </div>

              <div className="sk-confirm-footer">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "close_clear_all" })}
                  disabled={isClearing}
                  className="sk-confirm-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleClearAll(); }}
                  disabled={userInput !== confirmationPhrase || isClearing}
                  className="sk-confirm-btn sk-confirm-btn--danger"
                >
                  {isClearing ? "Clearing..." : "Clear All"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Clear Progress Confirmation Modal */}
      {showClearProgressModal &&
        createPortal(
          <div className="sk-confirm-backdrop">
            <div className="sk-confirm-panel">
              <div className="sk-confirm-header">
                <h3 className="sk-confirm-title">Clear progress data?</h3>
                <p className="sk-confirm-desc">
                  Sessions, stats, and question cache will be removed. This
                  action cannot be undone.
                </p>
              </div>

              <div className="sk-confirm-body">
                {message && (
                  <div
                    className={`sk-confirm-message ${
                      message.type === "success" ? "sk-confirm-message--success" : "sk-confirm-message--error"
                    }`}
                  >
                    {message.text}
                  </div>
                )}
                {!message && (
                  <p>
                    Are you sure you want to clear your practice statistics and
                    session history?
                  </p>
                )}
              </div>

              <div className="sk-confirm-footer">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "close_clear_progress" })}
                  disabled={isClearing}
                  className="sk-confirm-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleClearProgress(); }}
                  disabled={isClearing}
                  className="sk-confirm-btn sk-confirm-btn--warning"
                >
                  {isClearing ? "Clearing..." : "Clear Progress"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
