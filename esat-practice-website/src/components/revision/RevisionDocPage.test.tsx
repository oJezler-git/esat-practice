import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
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
