import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccuracyHistoryChart } from "./AccuracyHistoryChart";
import { getSessionSummaries } from "../../lib/statsStore";
import type { SessionSummary } from "../../types/schema";

vi.mock("../../lib/statsStore", () => ({
  getSessionSummaries: vi.fn(),
}));

const CHART_WIDTH = 400;

function makeSummary(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    session_id: "s1",
    completed_at: new Date(2026, 5, 1).getTime(),
    accuracy: 0.5,
    attempts: 10,
    correct: 5,
    total_time_ms: 90_000,
    ...overrides,
  } as SessionSummary;
}

// Newest-first, as getSessionSummaries returns them (the chart reverses).
const summaries = [
  makeSummary({ session_id: "s3", completed_at: new Date(2026, 5, 3).getTime(), accuracy: 0.7, correct: 7 }),
  makeSummary({ session_id: "s2", completed_at: new Date(2026, 5, 2).getTime(), accuracy: 0.6, correct: 6 }),
  makeSummary({ session_id: "s1", completed_at: new Date(2026, 5, 1).getTime(), accuracy: 0.5, correct: 5 }),
];

async function renderChart(currentAccuracy = 0.65) {
  // jsdom has no layout: give the svg a width so the chart internals render.
  Object.defineProperty(SVGElement.prototype, "clientWidth", {
    configurable: true,
    get: () => CHART_WIDTH,
  });
  const utils = render(<AccuracyHistoryChart currentAccuracy={currentAccuracy} />);
  await waitFor(() => {
    expect(utils.container.querySelector("polyline")).toBeInTheDocument();
  });
  const svg = utils.container.querySelector("svg")!;
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: CHART_WIDTH, height: 180, right: CHART_WIDTH, bottom: 180, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { ...utils, svg };
}

describe("AccuracyHistoryChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionSummaries).mockResolvedValue(summaries);
  });

  it("renders nothing with fewer than three completed sessions", async () => {
    vi.mocked(getSessionSummaries).mockResolvedValue(summaries.slice(0, 2));
    const { container } = render(<AccuracyHistoryChart currentAccuracy={0.5} />);
    await waitFor(() => {
      expect(getSessionSummaries).toHaveBeenCalled();
    });
    expect(container.querySelector(".sv-history")).not.toBeInTheDocument();
  });

  it("renders the history line, reference bands, and the current-session point", async () => {
    const { container } = await renderChart(0.65);

    expect(screen.getByText("Accuracy over time")).toBeInTheDocument();
    expect(screen.getByText("Typical offer")).toBeInTheDocument();
    expect(screen.getByText("Average applicant")).toBeInTheDocument();
    expect(screen.getByText("Top 10%")).toBeInTheDocument();

    // One dot per history session plus the terminal "now" dot.
    expect(container.querySelectorAll("circle")).toHaveLength(4);
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
  });

  it("shows a tooltip for the nearest point on hover and clears it on leave", async () => {
    const { container, svg } = await renderChart(0.65);

    // The oldest session's dot sits at the chart's left padding edge (x=38).
    fireEvent.mouseMove(svg, { clientX: 38, clientY: 60 });

    expect(container.querySelector(".sv-chart-tooltip")).toBeInTheDocument();
    expect(screen.getByText("1 Jun 2026")).toBeInTheDocument();
    expect(screen.getByText(/5\/10 correct/)).toBeInTheDocument();
    expect(screen.getByText(/1m 30s/)).toBeInTheDocument();

    fireEvent.mouseLeave(svg);
    expect(container.querySelector(".sv-chart-tooltip")).not.toBeInTheDocument();
  });

  it("hides the tooltip when the pointer is far from every point", async () => {
    const { container, svg } = await renderChart(0.65);

    fireEvent.mouseMove(svg, { clientX: 38, clientY: 60 });
    expect(container.querySelector(".sv-chart-tooltip")).toBeInTheDocument();

    // x=395 is well past the last history point (the terminal dot is not hoverable).
    fireEvent.mouseMove(svg, { clientX: 395, clientY: 60 });
    expect(container.querySelector(".sv-chart-tooltip")).not.toBeInTheDocument();
  });
});
