import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAllData, clearProgressData, generateConfirmationPhrase } from "../lib/dataManagement";

export function DataManagementSection() {
  const navigate = useNavigate();
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [userInput, setUserInput] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function openClearAllModal() {
    const phrase = generateConfirmationPhrase();
    setConfirmationPhrase(phrase);
    setUserInput("");
    setMessage(null);
    setShowClearAllModal(true);
  }

  function closeClearAllModal() {
    setShowClearAllModal(false);
    setConfirmationPhrase("");
    setUserInput("");
    setMessage(null);
  }

  async function handleClearAll() {
    if (userInput !== confirmationPhrase) {
      setMessage({ type: "error", text: "Confirmation phrase does not match" });
      return;
    }

    setIsClearing(true);
    try {
      await clearAllData();
      setMessage({ type: "success", text: "All data cleared. Reloading..." });
      setTimeout(() => {
        navigate("/");
        window.location.reload();
      }, 1500);
    } catch (error) {
      setMessage({ type: "error", text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` });
      setIsClearing(false);
    }
  }

  async function handleClearProgress() {
    if (!window.confirm("Clear progress data? Sessions, stats, and question cache will be removed.")) {
      return;
    }

    setIsClearing(true);
    try {
      await clearProgressData();
      setMessage({ type: "success", text: "Progress data cleared. Reloading..." });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      setMessage({
        type: "error",
        text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      setIsClearing(false);
    }
  }

  return (
    <section className="mb-8 border border-gray-200 rounded-xl bg-white overflow-hidden shadow">
      <div className="px-4 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Data Management</h2>
        <p className="text-xs text-gray-400 mt-1">Delete cached data and your progress history.</p>
      </div>

      <div className="divide-y divide-gray-100">
        {/* Clear Progress */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-gray-700">Clear Progress</p>
            <p className="text-xs text-gray-500 mt-1">Remove sessions, stats, and question cache</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleClearProgress();
            }}
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
            onClick={() => {
              openClearAllModal();
            }}
            disabled={isClearing}
            className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearAllModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Clear everything?</h3>
              <p className="text-sm text-gray-500 mt-1">
                This will delete all your data, including settings. This action cannot be undone.
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-700">
                Type the following to confirm: <span className="font-mono font-semibold text-red-600">{confirmationPhrase}</span>
              </p>
              <input
                type="text"
                value={userInput}
                onChange={(e) => {
                  setUserInput(e.target.value);
                  setMessage(null);
                }}
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
                onClick={closeClearAllModal}
                disabled={isClearing}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleClearAll();
                }}
                disabled={userInput !== confirmationPhrase || isClearing}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-300 disabled:cursor-not-allowed"
              >
                {isClearing ? "Clearing..." : "Clear All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
