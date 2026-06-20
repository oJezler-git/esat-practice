import { useEffect, useState } from "react";
import type { Attempt, SelfMarkResult } from "../../types/schema";

interface Props {
  currentIndex: number;
  timeRemaining?: number;
  isFlagged: boolean;
  onFlag: () => void;
  onNavigate: (index: number) => void;
  responses: Record<string, Attempt>;
  questionIds: string[];
}
// ... (helper functions formatTime, getStatusColor stay the same)
function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function getStatusColor(result?: SelfMarkResult) {
  switch (result) {
    case "correct":
      return "bg-green-500";
    case "incorrect":
      return "bg-red-500";
    case "skipped":
      return "bg-amber-500";
    default:
      return "bg-gray-700";
  }
}

export function SessionHeader({
  currentIndex,
  timeRemaining,
  isFlagged,
  onFlag,
  onNavigate,
  responses,
  questionIds,
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isLow = timeRemaining !== undefined && timeRemaining < 60_000;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const exitFullscreen = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen();
    }
  };

  return (
    <header className="z-10 bg-gray-50 border-b border-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-4">
        <div className="flex-1 flex items-center gap-1">
          {questionIds.map((id, index) => {
            const result = responses[id]?.result;
            const isCurrent = index === currentIndex;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(index)}
                className={`flex-1 h-3 rounded-sm border border-gray-200 transition-all hover:scale-105 ${
                  isCurrent ? "ring-2 ring-indigo-400 ring-offset-1" : ""
                } ${getStatusColor(result)}`}
                title={`Question ${index + 1}`}
              />
            );
          })}
        </div>

        {timeRemaining !== undefined && (
          <span
            className={`text-xs font-mono font-medium tabular-nums ${
              isLow ? "text-red-500" : "text-gray-500"
            }`}
          >
            {formatTime(timeRemaining)}
          </span>
        )}

        {isFullscreen && (
          <button
            type="button"
            onClick={exitFullscreen}
            title="Exit fullscreen"
            className="p-1 rounded text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 2H2v3l2.5-2.5L5 2zM11 2h3v3l-2.5-2.5L11 2zM11 14h3v-3l-2.5 2.5L11 14zM5 14H2v-3l2.5 2.5L5 14z" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={onFlag}
          title="Flag question (F)"
          className={`p-1 rounded transition-colors ${
            isFlagged ? "text-amber-500 bg-amber-50" : "text-gray-300 hover:text-gray-700"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2h9l-2.5 3.5L11 9H2V2z" />
            <line
              x1="2"
              y1="2"
              x2="2"
              y2="15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
