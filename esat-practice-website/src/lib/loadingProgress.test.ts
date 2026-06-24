import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getLoadingProgress,
  subscribeToLoadingProgress,
  setLoadingStage,
  startPackLoading,
  completePackLoading,
  completeAllLoading,
  resetLoadingProgress,
} from "./loadingProgress";

beforeEach(() => {
  resetLoadingProgress();
});

describe("getLoadingProgress", () => {
  it("returns the initial idle state on fresh start", () => {
    const state = getLoadingProgress();
    expect(state.stage).toBe("idle");
    expect(state.isLoading).toBe(false);
    expect(state.currentPack).toBeNull();
    expect(state.packIndex).toBe(0);
    expect(state.totalPacks).toBe(0);
    expect(state.percentComplete).toBe(0);
    expect(state.bytesLoaded).toBe(0);
    expect(state.totalBytes).toBe(0);
    expect(state.message).toBe("Ready");
  });
});

describe("subscribeToLoadingProgress", () => {
  it("calls the listener immediately with the current state", () => {
    const listener = vi.fn();
    const unsub = subscribeToLoadingProgress(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(getLoadingProgress());
    unsub();
  });

  it("calls the listener again on each state update", () => {
    const listener = vi.fn();
    const unsub = subscribeToLoadingProgress(listener);
    listener.mockClear();
    setLoadingStage("manifest", "Fetching manifest");
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("stops delivering updates after unsubscribe", () => {
    const listener = vi.fn();
    const unsub = subscribeToLoadingProgress(listener);
    unsub();
    listener.mockClear();
    setLoadingStage("manifest");
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple simultaneous listeners", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeToLoadingProgress(a);
    const ub = subscribeToLoadingProgress(b);
    a.mockClear();
    b.mockClear();
    setLoadingStage("manifest");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    ua();
    ub();
  });

  it("does not call other listeners after one unsubscribes", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeToLoadingProgress(a);
    const ub = subscribeToLoadingProgress(b);
    ua();
    a.mockClear();
    b.mockClear();
    setLoadingStage("manifest");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    ub();
  });
});

describe("setLoadingStage", () => {
  it("updates the stage field", () => {
    setLoadingStage("manifest");
    expect(getLoadingProgress().stage).toBe("manifest");
  });

  it("updates the message when one is provided", () => {
    setLoadingStage("manifest", "Fetching manifest now");
    expect(getLoadingProgress().message).toBe("Fetching manifest now");
  });

  it("preserves the existing message when none is provided", () => {
    setLoadingStage("manifest", "original message");
    setLoadingStage("packs");
    expect(getLoadingProgress().message).toBe("original message");
  });
});

describe("startPackLoading", () => {
  it("sets isLoading true and populates all pack fields", () => {
    startPackLoading("math-2019", 0, 5, 102400);
    const state = getLoadingProgress();
    expect(state.isLoading).toBe(true);
    expect(state.stage).toBe("packs");
    expect(state.currentPack).toBe("math-2019");
    expect(state.packIndex).toBe(0);
    expect(state.totalPacks).toBe(5);
    expect(state.totalBytes).toBe(102400);
  });

  it("builds a message mentioning the pack id and its position", () => {
    startPackLoading("physics-2021", 2, 8, 50000);
    const { message } = getLoadingProgress();
    expect(message).toContain("physics-2021");
    expect(message).toContain("3 of 8");
  });
});

describe("completePackLoading", () => {
  it("computes percentComplete as round(bytesLoaded / totalBytes * 100)", () => {
    startPackLoading("pack", 0, 1, 1000);
    completePackLoading("pack", 500);
    expect(getLoadingProgress().percentComplete).toBe(50);
  });

  it("reaches 100% when all bytes are loaded", () => {
    startPackLoading("pack", 0, 1, 1024);
    completePackLoading("pack", 1024);
    expect(getLoadingProgress().percentComplete).toBe(100);
  });

  it("includes the pack id in the resulting message", () => {
    startPackLoading("chem-2020", 0, 1, 2048);
    completePackLoading("chem-2020", 1024);
    expect(getLoadingProgress().message).toContain("chem-2020");
  });
});

describe("completeAllLoading", () => {
  it("marks loading as finished with full progress", () => {
    startPackLoading("pack", 0, 1, 1000);
    completeAllLoading();
    const state = getLoadingProgress();
    expect(state.isLoading).toBe(false);
    expect(state.stage).toBe("complete");
    expect(state.percentComplete).toBe(100);
    expect(state.currentPack).toBeNull();
    expect(state.message).toBe("Question bank ready");
  });
});

describe("resetLoadingProgress", () => {
  it("restores every field to its initial idle value", () => {
    startPackLoading("pack", 3, 10, 50000);
    completePackLoading("pack", 25000);
    resetLoadingProgress();
    const state = getLoadingProgress();
    expect(state.stage).toBe("idle");
    expect(state.isLoading).toBe(false);
    expect(state.currentPack).toBeNull();
    expect(state.packIndex).toBe(0);
    expect(state.totalPacks).toBe(0);
    expect(state.percentComplete).toBe(0);
    expect(state.bytesLoaded).toBe(0);
    expect(state.totalBytes).toBe(0);
    expect(state.message).toBe("Ready");
  });
});
