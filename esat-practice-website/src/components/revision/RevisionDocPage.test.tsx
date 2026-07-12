import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { revisionDocs, revisionModules } from "../../content/revision/manifest";
import { useRevisionProgress } from "../../store/revisionProgress";
import { RevisionDocPage } from "./RevisionDocPage";
import { RevisionHome } from "./RevisionHome";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/revision" element={<RevisionHome />} />
        <Route path="/revision/:moduleSlug/:topicSlug" element={<RevisionDocPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Revision docs routes", () => {
  it("renders the revision hub", () => {
    renderAt("/revision");

    expect(screen.getByRole("heading", { name: /topic guides/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /units/i }).length).toBeGreaterThan(0);
  });

  it("renders an MDX topic with teaching blocks and practice link", async () => {
    renderAt("/revision/m1/units");

    // Metadata title renders synchronously; the compiled guide loads on demand.
    expect(screen.getByRole("heading", { name: "Units" })).toBeInTheDocument();
    expect(
      // The compiled guide is a lazy chunk; allow time for the dynamic import.
      await screen.findByRole(
        "heading",
        { name: "M1.1 Standard and compound units" },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "M1.2 Converting between units" })).toBeInTheDocument();
    expect(screen.getByText("Find units questions")).toBeInTheDocument();
  });

  it("renders a not-found state for missing docs", () => {
    renderAt("/revision/m1/does-not-exist");

    expect(screen.getByRole("heading", { name: /does not exist/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to revision guide/i })).toBeInTheDocument();
  });
});

describe("Revision progress tracking", () => {
  beforeEach(() => {
    localStorage.clear();
    useRevisionProgress.getState().reset();
  });

  it("marks a topic done from the doc page and flips the button label", () => {
    renderAt("/revision/m1/units");

    const button = screen.getByRole("button", { name: /mark as done/i });
    fireEvent.click(button);

    expect(useRevisionProgress.getState().topics["m1/units"].done).toBe(true);
    expect(screen.getByRole("button", { name: /done ✓/i })).toBeInTheDocument();
  });

  it("records a visit when opening a topic", () => {
    renderAt("/revision/m1/units");
    expect(useRevisionProgress.getState().topics["m1/units"].lastVisited).not.toBeNull();
  });

  it("shows per-module done counts on the home", () => {
    const m1 = revisionModules.find((m) => m.slug === "m1")!;
    useRevisionProgress.getState().markDone(m1.docs[0].id, true);
    renderAt("/revision");

    expect(
      screen.getByText(new RegExp(`1 of ${m1.docs.length} done`, "i")),
    ).toBeInTheDocument();
  });

  it("shows the recents strip only when there is history", () => {
    const { unmount } = renderAt("/revision");
    expect(screen.queryByRole("navigation", { name: /continue where you left off/i })).toBeNull();
    unmount();

    const doc = revisionDocs.find((d) => d.meta.module === "m1")!;
    useRevisionProgress.getState().recordVisit(doc.id);
    renderAt("/revision");
    const strip = screen.getByRole("navigation", { name: /continue where you left off/i });
    expect(within(strip).getByRole("link", { name: new RegExp(doc.meta.title, "i") })).toBeInTheDocument();
  });
});
