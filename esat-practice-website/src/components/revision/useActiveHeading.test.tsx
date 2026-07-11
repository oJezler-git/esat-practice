import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RevisionHeading } from "../../content/revision/types";
import { useActiveHeading } from "./useActiveHeading";

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const observerRecords: ObserverRecord[] = [];

class TestIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number> = [];
  readonly callback: IntersectionObserverCallback;
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? "";
    observerRecords.push(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function HeadingHarness({ headings }: { headings: RevisionHeading[] }) {
  const [active, setActive] = useActiveHeading(headings);
  return (
    <>
      <div data-testid="active">{active}</div>
      {headings.map((heading) => (
        <h2 id={heading.id} key={heading.id}>
          {heading.text}
        </h2>
      ))}
      <button type="button" onClick={() => setActive("clicked")}>
        Click heading
      </button>
    </>
  );
}

const headings: RevisionHeading[] = [
  { id: "first", text: "First", level: 2 },
  { id: "second", text: "Second", level: 2 },
];

describe("useActiveHeading", () => {
  beforeEach(() => {
    observerRecords.length = 0;
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: TestIntersectionObserver,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to the first heading", () => {
    render(<HeadingHarness headings={headings} />);

    expect(screen.getByTestId("active")).toHaveTextContent("first");
  });

  it("returns an empty active id for an empty heading list", () => {
    render(<HeadingHarness headings={[]} />);

    expect(screen.getByTestId("active")).toHaveTextContent("");
    expect(observerRecords).toHaveLength(0);
  });

  it("activates a heading when its observer intersects", () => {
    render(<HeadingHarness headings={headings} />);

    act(() => {
      observerRecords[1].callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observerRecords[1] as unknown as IntersectionObserver,
      );
    });

    expect(screen.getByTestId("active")).toHaveTextContent("second");
  });

  it("disconnects heading observers on cleanup", () => {
    const { unmount } = render(<HeadingHarness headings={headings} />);

    unmount();

    expect(observerRecords).toHaveLength(2);
    expect(observerRecords[0].disconnect).toHaveBeenCalled();
    expect(observerRecords[1].disconnect).toHaveBeenCalled();
  });

  it("exposes immediate active-heading updates for TOC clicks", () => {
    render(<HeadingHarness headings={headings} />);

    fireEvent.click(screen.getByRole("button", { name: "Click heading" }));

    expect(screen.getByTestId("active")).toHaveTextContent("clicked");
  });
});
