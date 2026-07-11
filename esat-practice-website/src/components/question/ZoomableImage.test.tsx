import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomableImage } from "./ZoomableImage";

let resizeCallback: ResizeObserverCallback | null;
const observe = vi.fn();
const disconnect = vi.fn();

class TestResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  observe = observe;
  unobserve = vi.fn();
  disconnect = disconnect;
}

function renderViewer() {
  return render(
    <ZoomableImage
      src="/scan.png"
      alt="Source scan"
      previewButtonClassName="preview"
    />,
  );
}

function openViewer() {
  fireEvent.click(screen.getByRole("button", { name: "Source scan" }));
  const images = screen.getAllByRole("img", { name: "Source scan" });
  const expandedImage = images[images.length - 1];
  Object.defineProperties(expandedImage, {
    naturalWidth: { configurable: true, value: 1000 },
    naturalHeight: { configurable: true, value: 500 },
  });
  fireEvent.load(expandedImage);
  act(() => resizeCallback?.([], {} as ResizeObserver));
  return document.querySelector(".source-scan-backdrop") as HTMLDivElement;
}

describe("ZoomableImage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resizeCallback = null;
    observe.mockClear();
    disconnect.mockClear();
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 });
    document.body.style.overflow = "auto";
  });

  afterEach(() => {
    document.body.style.overflow = "";
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens, locks body scrolling, closes with Escape, and restores cleanup state", () => {
    renderViewer();
    openViewer();
    expect(document.querySelector(".source-scan-modal")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(observe).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".source-scan-backdrop")).toHaveClass("modal-backdrop-exit");
    act(() => vi.advanceTimersByTime(200));
    expect(document.querySelector(".source-scan-modal")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("auto");
    expect(disconnect).toHaveBeenCalled();
  });

  it("closes from the backdrop but ignores clicks inside the modal", () => {
    renderViewer();
    const backdrop = openViewer();
    fireEvent.click(document.querySelector(".source-scan-modal")!);
    act(() => vi.advanceTimersByTime(250));
    expect(document.querySelector(".source-scan-modal")).toBeInTheDocument();
    fireEvent.click(backdrop);
    act(() => vi.advanceTimersByTime(200));
    expect(document.querySelector(".source-scan-modal")).not.toBeInTheDocument();
  });

  it("zooms with buttons and wheel, pans by dragging, and resets", () => {
    renderViewer();
    openViewer();
    const viewport = document.querySelector(".source-scan-viewport") as HTMLDivElement;
    const paper = document.querySelector(".source-scan-paper") as HTMLDivElement;
    Object.assign(viewport, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    viewport.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600,
      toJSON: () => ({}),
    });
    act(() => vi.advanceTimersByTime(300));

    fireEvent.click(screen.getByTitle("Zoom in"));
    expect(paper.style.transform).toContain("scale(1.25)");
    fireEvent.wheel(viewport, { deltaY: -800, clientX: 500, clientY: 300 });
    act(() => vi.advanceTimersByTime(2500));
    expect(paper.style.transform).not.toContain("scale(1.25)");

    fireEvent.pointerDown(viewport, { button: 0, pointerId: 4, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(viewport, { pointerId: 4, clientX: 380, clientY: 330 });
    fireEvent.pointerUp(viewport, { pointerId: 4, clientX: 380, clientY: 330 });
    expect(viewport.setPointerCapture).toHaveBeenCalledWith(4);
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(4);
    expect(paper.style.transform).toMatch(/translate3d\((?!0px, 0px)/);

    fireEvent.click(screen.getByTitle("Reset zoom"));
    expect(paper.style.transform).toContain("scale(1)");
  });

  it("disconnects ResizeObserver and restores body overflow on unmount", () => {
    const { unmount } = renderViewer();
    openViewer();
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("auto");
  });
});
