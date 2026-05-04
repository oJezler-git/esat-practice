import { useLoadingProgress } from "../hooks/useLoadingProgress";

export function LoadingProgressDisplay() {
  const progress = useLoadingProgress();

  if (!progress.isLoading || progress.stage === "idle") {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4">
        <h2 className="text-lg font-medium mb-4 text-gray-900">Loading Question Bank</h2>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Overall Progress</span>
            <span className="text-sm font-semibold text-indigo-600">{progress.percentComplete}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300 ease-out"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>

        {/* Pack info */}
        {progress.stage === "packs" && progress.currentPack && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-900 mb-1">{progress.currentPack}</p>
            <p className="text-xs text-gray-500">
              Pack {progress.packIndex + 1} of {progress.totalPacks}
            </p>
          </div>
        )}

        {/* Status message */}
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">{progress.message}</p>
          <p className="text-xs text-gray-400">
            {progress.bytesLoaded > 0 && (
              <>
                {Math.round(progress.bytesLoaded / 1024 / 1024)}MB /{" "}
                {Math.round(progress.totalBytes / 1024 / 1024)}MB downloaded
              </>
            )}
          </p>
        </div>

        {/* Loading spinner */}
        <div className="mt-6 flex justify-center">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}
