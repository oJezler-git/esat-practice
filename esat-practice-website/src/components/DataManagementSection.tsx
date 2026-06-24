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
      <section className="mb-8 border border-gray-200 rounded-xl bg-white overflow-hidden shadow">
        <div className="px-4 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Data Management
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Delete cached data and your progress history.
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Clear Progress */}
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Clear Progress
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Remove sessions, stats, and question cache
              </p>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "open_clear_progress" })}
              disabled={isClearing}
              className="px-3 py-1.5 text-sm border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>

          {/* Clear All */}
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-700">Clear All</p>
              <p className="text-xs text-gray-500 mt-1">
                Delete everything including settings (start from scratch)
              </p>
            </div>
            <button
              type="button"
              onClick={openClearAllModal}
              disabled={isClearing}
              className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      {/* Clear All Confirmation Modal */}
      {showClearAllModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-lg w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Clear everything?
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  This will delete all your data, including settings. This
                  action cannot be undone.
                </p>
              </div>

              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-gray-700">
                  Type the following to confirm:{" "}
                  <span className="font-mono font-semibold text-red-600">
                    {confirmationPhrase}
                  </span>
                </p>
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => dispatch({ type: "update_input", value: e.target.value })}
                  placeholder="Type confirmation phrase..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400"
                />

                {message && (
                  <div
                    className={`px-3 py-2 rounded-lg text-sm ${
                      message.type === "success"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {message.text}
                  </div>
                )}
              </div>

              <div className="px-6 py-3 border-t border-gray-200 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "close_clear_all" })}
                  disabled={isClearing}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleClearAll(); }}
                  disabled={userInput !== confirmationPhrase || isClearing}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-300 disabled:cursor-not-allowed"
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
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-lg w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Clear progress data?
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Sessions, stats, and question cache will be removed. This
                  action cannot be undone.
                </p>
              </div>

              <div className="px-6 py-4">
                {message && (
                  <div
                    className={`px-3 py-2 rounded-lg text-sm ${
                      message.type === "success"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {message.text}
                  </div>
                )}
                {!message && (
                  <p className="text-sm text-gray-700">
                    Are you sure you want to clear your practice statistics and
                    session history?
                  </p>
                )}
              </div>

              <div className="px-6 py-3 border-t border-gray-200 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "close_clear_progress" })}
                  disabled={isClearing}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleClearProgress(); }}
                  disabled={isClearing}
                  className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:bg-amber-300 disabled:cursor-not-allowed"
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
