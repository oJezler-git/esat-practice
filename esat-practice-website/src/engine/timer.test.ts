import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSessionTicker } from "./timer";

describe("timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should call onTick with elapsed time", () => {
    const onTick = vi.fn();
    const ticker = createSessionTicker(onTick, 1000);

    ticker.start();
    
    // Advance time by 1000ms
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledWith(expect.any(Number));
    
    // The actual elapsed might vary slightly even with fake timers if we use Date.now()
    // but with vi.advanceTimersByTime it should be exact.
    const firstCall = onTick.mock.calls[0][0];
    expect(firstCall).toBeGreaterThanOrEqual(1000);
  });

  it("should stop ticking when stop is called", () => {
    const onTick = vi.fn();
    const ticker = createSessionTicker(onTick, 1000);

    ticker.start();
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(1);

    ticker.stop();
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("should not tick if document is hidden", () => {
    const onTick = vi.fn();
    const ticker = createSessionTicker(onTick, 1000);

    // Mock document.hidden
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });

    ticker.start();
    vi.advanceTimersByTime(1000);
    expect(onTick).not.toHaveBeenCalled();
  });

  it("should resume ticking when document becomes visible", () => {
    const onTick = vi.fn();
    const ticker = createSessionTicker(onTick, 1000);

    let isHidden = true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => isHidden,
    });

    ticker.start();
    vi.advanceTimersByTime(1000);
    expect(onTick).not.toHaveBeenCalled();

    // Make visible and trigger visibilitychange
    isHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("should report correct isRunning status", () => {
    const ticker = createSessionTicker(() => {});
    expect(ticker.isRunning()).toBe(false);
    
    ticker.start();
    expect(ticker.isRunning()).toBe(true);
    
    ticker.stop();
    expect(ticker.isRunning()).toBe(false);
  });
});
