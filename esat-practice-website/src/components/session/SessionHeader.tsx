import { useEffect, useState, useRef } from "react";
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

  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const current = useRef({ x: 0 });
  const target = useRef({ x: 0 });
  const velocity = useRef({ x: 0 });
  const isFirstRender = useRef(true);
  const isRunning = useRef(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    let animationFrameId: number | null = null;
    let lastTime = performance.now();
    const stiffness = 320;
    const damping = 28;

    const updateStyles = () => {
      const indicator = indicatorRef.current;
      if (!indicator) return;
      indicator.style.transform = `translateX(calc(-50% + ${current.current.x}px))`;
    };

    const animate = (time: number) => {
      let dt = (time - lastTime) / 1000;
      lastTime = time;
      if (dt > 0.1) dt = 0.1;

      const step = 0.002;
      let accumulator = dt;

      while (accumulator >= step) {
        const dx = target.current.x - current.current.x;
        const ax = dx * stiffness - velocity.current.x * damping;
        velocity.current.x += ax * step;
        current.current.x += velocity.current.x * step;
        accumulator -= step;
      }

      updateStyles();

      const isSettled = Math.abs(target.current.x - current.current.x) < 0.05 && Math.abs(velocity.current.x) < 0.05;
      if (isSettled) {
        current.current.x = target.current.x;
        velocity.current.x = 0;
        isRunning.current = false;
      } else {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    const startAnimation = () => {
      if (isRunning.current) return;
      isRunning.current = true;
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(animate);
    };

    const updateIndicatorPosition = () => {
      const container = buttonContainerRef.current;
      if (!container) return;

      const buttons = container.querySelectorAll("button");
      if (buttons.length === 0 || currentIndex >= buttons.length) return;

      const currentButton = buttons[currentIndex] as HTMLElement;
      const containerRect = container.getBoundingClientRect();
      const buttonRect = currentButton.getBoundingClientRect();
      const nextTarget = buttonRect.left - containerRect.left + buttonRect.width / 2;

      if (isFirstRender.current) {
        current.current.x = nextTarget;
        target.current.x = nextTarget;
        isFirstRender.current = false;
        updateStyles();
      } else {
        if (Math.abs(target.current.x - nextTarget) > 0.1) {
          target.current.x = nextTarget;
          startAnimation();
        }
      }
    };

    updateIndicatorPosition();
    const timeoutId = window.setTimeout(updateIndicatorPosition, 0);

    const handleResize = () => {
      isFirstRender.current = true;
      updateIndicatorPosition();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      isRunning.current = false;
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
    };
  }, [currentIndex, questionIds.length]);

  const exitFullscreen = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen();
    }
  };

  return (
    <header className="z-10 bg-gray-50 border-b border-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-4">
        <div className="flex-1 flex items-center gap-1 relative">
          <div
            ref={indicatorRef}
            className="absolute rounded-full bg-indigo-500 pointer-events-none"
            style={{ left: "0px", top: "calc(100% + 6px)", width: "6px", height: "6px", transform: "translateX(-50%)", zIndex: 10 }}
          />
          <div ref={buttonContainerRef} className="flex items-center gap-1 w-full">
            {questionIds.map((id, index) => {
              const result = responses[id]?.result;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(index)}
                  className={`flex-1 h-3 rounded-sm border border-gray-200 transition-all hover:scale-105 ${getStatusColor(result)}`}
                  title={`Question ${index + 1}`}
                />
              );
            })}
          </div>
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
