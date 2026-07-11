import { afterEach, describe, expect, it, vi } from "vitest";
import { isInstalledPWA } from "./pwa";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
const originalStandalone = Object.getOwnPropertyDescriptor(navigator, "standalone");

afterEach(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  }
  if (originalStandalone) {
    Object.defineProperty(navigator, "standalone", originalStandalone);
  } else {
    delete (navigator as { standalone?: boolean }).standalone;
  }
  vi.restoreAllMocks();
});

describe("isInstalledPWA", () => {
  it("returns true for standalone display mode", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(isInstalledPWA()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(display-mode: standalone)");
  });

  it("returns true for iOS navigator.standalone", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });

    expect(isInstalledPWA()).toBe(true);
  });

  it("returns false in a normal browser tab", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: false,
    });

    expect(isInstalledPWA()).toBe(false);
  });
});
