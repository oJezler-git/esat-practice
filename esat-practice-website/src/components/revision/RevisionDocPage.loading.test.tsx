import type { ComponentType } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const manifestMock = vi.hoisted(() => {
  const doc = {
    id: "m1/units",
    path: "./topics/m1/units.mdx",
    meta: {
      slug: "units",
      module: "m1" as const,
      title: "Units",
      subtitle: "Work cleanly with physical quantities.",
      topicCode: "M1.1",
      estimatedMinutes: 8,
      order: 1,
    },
  };

  const module = {
    slug: "m1" as const,
    title: "Mathematics 1",
    shortTitle: "M1",
    docs: [doc],
  };

  return {
    doc,
    module,
    findRevisionDoc: vi.fn((moduleSlug?: string, topicSlug?: string) =>
      moduleSlug === "m1" && topicSlug === "units" ? doc : undefined,
    ),
    getRevisionModule: vi.fn(() => module),
    loadRevisionContent: vi.fn(),
    loadRevisionRaw: vi.fn(),
    prefetchRevisionContent: vi.fn(),
  };
});

vi.mock("../../content/revision/manifest", () => ({
  findRevisionDoc: manifestMock.findRevisionDoc,
  getRevisionModule: manifestMock.getRevisionModule,
  loadRevisionContent: manifestMock.loadRevisionContent,
  loadRevisionRaw: manifestMock.loadRevisionRaw,
  prefetchRevisionContent: manifestMock.prefetchRevisionContent,
  revisionModules: [manifestMock.module],
}));

import { RevisionDocPage } from "./RevisionDocPage";

function renderDoc() {
  return render(
    <MemoryRouter initialEntries={["/revision/m1/units"]}>
      <Routes>
        <Route path="/revision/:moduleSlug/:topicSlug" element={<RevisionDocPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function TopicContent() {
  return <h2>M1.1 Standard units</h2>;
}

describe("RevisionDocPage loading states", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    manifestMock.loadRevisionContent.mockReset();
    manifestMock.loadRevisionRaw.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the slow-load skeleton only after the delay", async () => {
    manifestMock.loadRevisionContent.mockReturnValue(new Promise<ComponentType<any>>(() => {}));

    const { container } = renderDoc();
    expect(screen.getByRole("heading", { name: "Units" })).toBeInTheDocument();
    expect(container.querySelector(".rev-mdx-skeleton")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(151);
    });

    expect(container.querySelector(".rev-mdx-skeleton")).toBeInTheDocument();
  });

  it("keeps the skeleton in place when content loading fails", async () => {
    manifestMock.loadRevisionContent.mockRejectedValue(new Error("chunk failed"));

    const { container } = renderDoc();

    await act(async () => {
      vi.advanceTimersByTime(151);
      await Promise.resolve();
    });

    expect(container.querySelector(".rev-mdx-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "M1.1 Standard units" })).not.toBeInTheDocument();
  });

  it("replaces the skeleton when content eventually loads", async () => {
    manifestMock.loadRevisionContent.mockResolvedValue(TopicContent);

    const { container } = renderDoc();

    await act(async () => {
      vi.advanceTimersByTime(151);
      await Promise.resolve();
      vi.runOnlyPendingTimers();
    });

    expect(container.querySelector(".rev-mdx-skeleton")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "M1.1 Standard units" })).toBeInTheDocument();
  });
});
