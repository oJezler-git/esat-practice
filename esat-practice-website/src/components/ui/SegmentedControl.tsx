import { useEffect, useRef, useState, type ReactNode } from "react";

export type SegmentTone = "accent" | "danger";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  tone?: SegmentTone;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** Extra class on the track element, for page-specific sizing/spacing. */
  className?: string;
}

/**
 * A segmented (tab) control whose active pill glides between options with the
 * same spring physics as the main nav's active pill — a light squash-and-blur
 * as it moves, settling with a subtle overshoot. The pill colour follows the
 * active option's `tone` (amber by default, red for `danger`).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  const current = useRef({ x: 0, width: 0 });
  const target = useRef({ x: 0, width: 0 });
  const velocity = useRef({ x: 0, width: 0 });
  const isFirstRender = useRef(true);
  const [isVisible, setIsVisible] = useState(false);

  const activeTone = options.find((option) => option.value === value)?.tone ?? "accent";

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let isRunning = false;

    const stiffness = 320;
    const damping = 28;

    const updateStyles = () => {
      const pill = pillRef.current;
      if (!pill) return;

      const absVx = Math.abs(velocity.current.x);
      const scaleX = 1 + Math.min(absVx * 0.0006, 0.6);
      const blur = Math.min(absVx * 0.002, 2.5);

      pill.style.width = `${current.current.width}px`;
      pill.style.transform = `translate3d(${current.current.x}px, 0, 0) scaleX(${scaleX})`;
      pill.style.filter = blur > 0.15 ? `blur(${blur}px)` : "none";
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

        const dw = target.current.width - current.current.width;
        const aw = dw * stiffness - velocity.current.width * damping;
        velocity.current.width += aw * step;
        current.current.width += velocity.current.width * step;

        accumulator -= step;
      }

      updateStyles();

      const isSettled =
        Math.abs(target.current.x - current.current.x) < 0.05 &&
        Math.abs(velocity.current.x) < 0.05 &&
        Math.abs(target.current.width - current.current.width) < 0.05 &&
        Math.abs(velocity.current.width) < 0.05;

      if (isSettled) {
        current.current = { ...target.current };
        velocity.current = { x: 0, width: 0 };
        updateStyles();
        isRunning = false;
      } else {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    const startAnimation = () => {
      if (isRunning) return;
      isRunning = true;
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(animate);
    };

    const syncPillHeight = (activeEl: HTMLElement) => {
      const pill = pillRef.current;
      if (!pill) return;
      pill.style.top = `${activeEl.offsetTop}px`;
      pill.style.height = `${activeEl.offsetHeight}px`;
    };

    const updateTarget = () => {
      const container = containerRef.current;
      if (!container) return;

      const activeElement = container.querySelector<HTMLElement>('[data-seg-active="true"]');
      if (!activeElement) {
        setIsVisible(false);
        return;
      }

      syncPillHeight(activeElement);
      const nextTarget = { x: activeElement.offsetLeft, width: activeElement.offsetWidth };

      if (isFirstRender.current) {
        current.current = { ...nextTarget };
        target.current = { ...nextTarget };
        isFirstRender.current = false;
        setIsVisible(true);
        requestAnimationFrame(updateStyles);
      } else {
        const hasChanged =
          Math.abs(target.current.x - nextTarget.x) > 0.1 ||
          Math.abs(target.current.width - nextTarget.width) > 0.1;
        setIsVisible(true);
        if (hasChanged) {
          target.current = nextTarget;
          startAnimation();
        }
      }
    };

    updateTarget();
    // Let the active class paint before measuring.
    const timeoutId = setTimeout(updateTarget, 0);

    const handleResize = () => {
      isFirstRender.current = true;
      updateTarget();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      data-tone={activeTone}
      className={`sk-seg ${className ?? ""}`}
    >
      <span
        ref={pillRef}
        className="sk-seg__pill"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "center center",
          willChange: "transform, width, filter",
          opacity: isVisible ? 1 : 0,
          transition: "opacity 150ms ease",
        }}
      />
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-seg-active={isActive || undefined}
            onClick={() => onChange(option.value)}
            className={`sk-seg__btn ${isActive ? "sk-seg__btn--active" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
