import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { revisionDocs } from "../../content/revision/manifest";
import { useRevisionProgress } from "../../store/revisionProgress";
import { RevisionLayout } from "./RevisionLayout";

vi.mock("./RevisionAsk", () => ({
  RevisionAsk: () => null,
}));

const firstDoc = revisionDocs.find((doc) => doc.meta.module === "m1") ?? revisionDocs[0];
const secondDoc =
  revisionDocs.find((doc) => doc.meta.module === firstDoc.meta.module && doc.id !== firstDoc.id) ??
  firstDoc;

function renderLayout(currentDoc = firstDoc) {
  return render(
    <MemoryRouter>
      <RevisionLayout currentDoc={currentDoc}>
        <h1>{currentDoc.meta.title}</h1>
      </RevisionLayout>
    </MemoryRouter>,
  );
}

function openDrawer() {
  fireEvent.click(screen.getByRole("button", { name: /mathematics 1 topics/i }));
  return screen.getByRole("dialog", { name: "Mathematics 1 revision topics" });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("RevisionLayout mobile drawer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens the mobile topic drawer from the trigger", () => {
    renderLayout();

    const trigger = screen.getByRole("button", { name: /mathematics 1 topics/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    const dialog = openDrawer();

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes from the close button after the 200ms exit timeout", () => {
    renderLayout();
    openDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("dialog", { name: "Mathematics 1 revision topics" })).toBeInTheDocument();

    advance(199);
    expect(screen.getByRole("dialog", { name: "Mathematics 1 revision topics" })).toBeInTheDocument();

    advance(1);
    expect(screen.queryByRole("dialog", { name: "Mathematics 1 revision topics" })).not.toBeInTheDocument();
  });

  it("closes from the backdrop", () => {
    renderLayout();
    const dialog = openDrawer();

    fireEvent.click(dialog.parentElement!);
    advance(200);

    expect(screen.queryByRole("dialog", { name: "Mathematics 1 revision topics" })).not.toBeInTheDocument();
  });

  it("closes immediately when the active route doc changes", () => {
    const view = renderLayout(firstDoc);
    openDrawer();

    act(() => {
      view.rerender(
        <MemoryRouter>
          <RevisionLayout currentDoc={secondDoc}>
            <h1>{secondDoc.meta.title}</h1>
          </RevisionLayout>
        </MemoryRouter>,
      );
    });

    expect(screen.queryByRole("dialog", { name: "Mathematics 1 revision topics" })).not.toBeInTheDocument();
  });

  it("cleans up a pending 200ms close timeout on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const view = renderLayout();
    openDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    view.unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

describe("RevisionLayout sidebar status", () => {
  beforeEach(() => {
    localStorage.clear();
    useRevisionProgress.getState().reset();
  });

  function sidebarLink(doc = firstDoc) {
    const sidebar = screen.getByRole("complementary", {
      name: /revision topics/i,
    });
    return within(sidebar).getByRole("link", { name: new RegExp(doc.meta.title, "i") });
  }

  it("shows a done check for a topic marked done", () => {
    useRevisionProgress.getState().markDone(firstDoc.id, true);
    renderLayout();
    expect(within(sidebarLink()).getByRole("img", { name: "Done" })).toBeInTheDocument();
  });

  it("shows a read-progress bar reflecting scrollPct when not done", () => {
    useRevisionProgress.getState().recordScroll(firstDoc.id, 40);
    renderLayout();
    const bar = within(sidebarLink()).getByRole("img", { name: /40% read/i });
    expect(bar.querySelector(".rev-read-bar-fill")).toHaveStyle({ width: "40%" });
  });
});
