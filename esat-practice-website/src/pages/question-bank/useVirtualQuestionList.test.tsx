import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import type { Question } from "../../types/schema";
import { useVirtualQuestionList } from "./useVirtualQuestionList";

function makeQuestion(id: string): Question {
  return {
    id,
    source: { paper: "ENGAA", year: 2020, part: "1A", subject: "Math", page: 1 },
    content: { text: `Question ${id}` },
    answer: { correct: "A", verified: true },
    taxonomy: {
      primary_topic: "Algebra",
      secondary_topics: [],
      confidence: 1,
      model_used: "test",
    },
    meta: { times_attempted: 0, accuracy_rate: 0 },
  };
}

function makeQuestions(count: number, prefix = "q") {
  return Array.from({ length: count }, (_, index) => makeQuestion(`${prefix}${index}`));
}

let matchMediaMatches = false;
let mediaChangeListener: ((event: MediaQueryListEvent) => void) | null = null;
let addMediaListener: ReturnType<typeof vi.fn>;
let removeMediaListener: ReturnType<typeof vi.fn>;

function installMatchMedia() {
  addMediaListener = vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
    if (event === "change") {
      mediaChangeListener = listener;
    }
  });
  removeMediaListener = vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
    if (event === "change" && mediaChangeListener === listener) {
      mediaChangeListener = null;
    }
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      get matches() {
        return matchMediaMatches;
      },
      media: "(max-width: 768px)",
      onchange: null,
      addEventListener: addMediaListener,
      removeEventListener: removeMediaListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

let latest:
  | ReturnType<typeof useVirtualQuestionList>
  | undefined;

function VirtualHarness({ questions }: { questions: Question[] }) {
  latest = useVirtualQuestionList(questions);

  useEffect(() => {
    if (latest?.listRef.current) {
      latest.listRef.current.getBoundingClientRect = () =>
        ({
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    }
  });

  return (
    <div>
      <div ref={latest.listRef} data-testid="list" />
      <output data-testid="slice">{latest.virtualSlice.map((q) => q.id).join(",")}</output>
      <output data-testid="metrics">
        {[
          latest.cardHeight,
          latest.rowGap,
          latest.rowHeight,
          latest.startIndex,
          latest.endIndex,
          latest.dynamicTotalHeight,
          latest.detailBlockHeight,
          latest.selectedQuestion?.id ?? "none",
          latest.isAnimating ? "animating" : "idle",
        ].join("|")}
      </output>
      <button type="button" onClick={() => latest?.setExpanded(questions[0]?.id ?? null)}>
        Expand first
      </button>
      <button type="button" onClick={() => latest?.handleDetailHeightChange(200)}>
        Detail 200
      </button>
    </div>
  );
}

function current() {
  if (!latest) {
    throw new Error("Harness has not rendered");
  }
  return latest;
}

describe("useVirtualQuestionList", () => {
  beforeEach(() => {
    latest = undefined;
    matchMediaMatches = false;
    mediaChangeListener = null;
    installMatchMedia();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 300,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      writable: true,
      value: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an initial virtual slice from the first batch", () => {
    render(<VirtualHarness questions={makeQuestions(120)} />);

    expect(current().rowHeight).toBe(104);
    expect(current().startIndex).toBe(0);
    expect(current().endIndex).toBe(19);
    expect(current().virtualSlice).toHaveLength(19);
    expect(screen.getByTestId("slice")).toHaveTextContent("q0,q1,q2");
  });

  it("resets visible count when the filtered list changes", () => {
    const { rerender } = render(<VirtualHarness questions={makeQuestions(200)} />);

    expect(current().dynamicTotalHeight).toBe(80 * 104);

    rerender(<VirtualHarness questions={makeQuestions(20, "next")} />);

    expect(current().startIndex).toBeGreaterThanOrEqual(0);
    expect(current().endIndex).toBe(19);
    expect(current().virtualSlice).toHaveLength(19);
    expect(current().dynamicTotalHeight).toBe(20 * 104);
    expect(screen.getByTestId("slice")).toHaveTextContent("next0");
  });

  it("uses mobile row sizing when the media query matches and responds to changes", () => {
    matchMediaMatches = true;
    render(<VirtualHarness questions={makeQuestions(20)} />);

    expect(current().cardHeight).toBe(152);
    expect(current().rowGap).toBe(12);
    expect(current().rowHeight).toBe(164);

    act(() => {
      matchMediaMatches = false;
      mediaChangeListener?.({ matches: false } as MediaQueryListEvent);
    });

    expect(current().cardHeight).toBe(90);
    expect(current().rowGap).toBe(14);
    expect(current().rowHeight).toBe(104);
  });

  it("adds expanded-detail height below the selected row", () => {
    vi.useFakeTimers();
    render(<VirtualHarness questions={makeQuestions(20)} />);

    act(() => {
      screen.getByRole("button", { name: "Expand first" }).click();
      screen.getByRole("button", { name: "Detail 200" }).click();
    });

    expect(current().selectedQuestion?.id).toBe("q0");
    expect(current().detailBlockHeight).toBe(214);
    expect(current().dynamicTotalHeight).toBe(20 * 104 + 214);
    expect(current().isAnimating).toBe(true);

    act(() => {
      vi.advanceTimersByTime(260);
    });

    expect(current().isAnimating).toBe(false);
  });

  it("invalidates the selected question when the filtered list removes it", () => {
    const { rerender } = render(<VirtualHarness questions={makeQuestions(3)} />);

    act(() => {
      screen.getByRole("button", { name: "Expand first" }).click();
    });
    expect(current().expandedId).toBe("q0");
    expect(current().selectedQuestion?.id).toBe("q0");

    rerender(<VirtualHarness questions={makeQuestions(2, "next")} />);

    expect(current().expandedId).toBe("q0");
    expect(current().selectedQuestion).toBeNull();
    expect(current().selectedIndex).toBe(-1);
  });

  it("cleans up scroll, resize, matchMedia, and animation timer subscriptions", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const clearSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = render(<VirtualHarness questions={makeQuestions(20)} />);
    act(() => {
      screen.getByRole("button", { name: "Expand first" }).click();
    });

    unmount();

    expect(addSpy).toHaveBeenCalledWith("scroll", expect.any(Function), {
      passive: true,
    });
    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(addMediaListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removeMediaListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(clearSpy).toHaveBeenCalled();
  });
});
