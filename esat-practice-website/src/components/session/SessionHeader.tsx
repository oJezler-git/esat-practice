import { useEffect, useState, useRef } from "react";
import type { Attempt, SelfMarkResult } from "../../types/schema";

interface Props {
  currentIndex: number;
  timeRemaining?: number;
  isFlagged: boolean;
  onFlag: () => void;
  onNavigate: (index: number) => void;
  onQuit: () => void;
  responses: Record<string, Attempt>;
  questionIds: string[];
}

export function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else if (document.documentElement.requestFullscreen) {
    void document.documentElement.requestFullscreen();
  }
}

function getStatusClass(result?: SelfMarkResult) {
  switch (result) {
    case "correct":
      return "sk-seg--correct";
    case "incorrect":
      return "sk-seg--incorrect";
    case "skipped":
      return "sk-seg--skipped";
    default:
      return "";
  }
}

export function SessionHeader({
  currentIndex,
  timeRemaining,
  isFlagged,
  onFlag,
  onNavigate,
  onQuit,
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

  return (
    <header className="sk-session-topbar">
      <div className="sk-seg-area">
        <div
          ref={indicatorRef}
          className="sk-seg-dot"
          style={{ left: "0px", top: "-9px", transform: "translateX(-50%)" }}
        />
        <div ref={buttonContainerRef} className="sk-seg-track">
          {questionIds.map((id, index) => {
            const result = responses[id]?.result;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(index)}
                className={`sk-seg ${getStatusClass(result)}`}
                aria-label={`Go to question ${index + 1}`}
                title={`Question ${index + 1}`}
              />
            );
          })}
        </div>
      </div>

      {timeRemaining !== undefined && (
        <span className={`sk-session-timer ${isLow ? "sk-session-timer--low" : ""}`}>
          {formatTime(timeRemaining)}
        </span>
      )}

      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        className="sk-session-icon-btn"
      >
        {isFullscreen ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 2H2v3l2.5-2.5L5 2zM11 2h3v3l-2.5-2.5L11 2zM11 14h3v-3l-2.5 2.5L11 14zM5 14H2v-3l2.5 2.5L5 14z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 0h4.5v1.5H1.5V4.5H0ZM11.5 0H16v4.5h-1.5V1.5H11.5ZM0 11.5h1.5V14.5H4.5V16H0ZM14.5 11.5H16V16H11.5v-1.5h3Z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={onFlag}
        aria-label={isFlagged ? "Unflag question" : "Flag question"}
        title="Flag question (F)"
        className={`sk-session-icon-btn ${isFlagged ? "sk-session-icon-btn--active" : ""}`}
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

      <button
        type="button"
        onClick={onQuit}
        aria-label="Quit session"
        title="Quit session"
        className="sk-session-icon-btn"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 2H3.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1H6" strokeLinecap="round" />
          <path d="M10.5 5 14 8l-3.5 3" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="14" y1="8" x2="6" y2="8" strokeLinecap="round" />
        </svg>
      </button>
    </header>
  );
}
