import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ModuleResult } from "../../lib/esatScaling";
import { getScoreBand } from "../../lib/esatScaling";
import { ModuleScoreCard } from "./ModuleScoreCard";

function makeResult(overrides: Partial<ModuleResult> = {}): ModuleResult {
  const scaled = overrides.scaled ?? 6.3;
  return {
    module: "maths1",
    correct: 6,
    total: 12,
    extrapolatedRaw: 14,
    scaled,
    scaledLow: overrides.scaledLow ?? 5.5,
    scaledHigh: overrides.scaledHigh ?? 7.0,
    band: getScoreBand(scaled),
    isLowSample: false,
    isCeilingExtrapolated: false,
    ...overrides,
  };
}

describe("ModuleScoreCard", () => {
  it("renders low-sample warning, score range, and benchmark gap copy", () => {
    render(
      <ModuleScoreCard
        label="Mathematics 1"
        result={makeResult({
          total: 4,
          scaled: 6.3,
          scaledLow: 4.5,
          scaledHigh: 7.0,
          isLowSample: true,
        })}
      />,
    );

    expect(screen.getByText("Mathematics 1")).toBeInTheDocument();
    expect(screen.getByText(/4\.5.7\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Low sample \(4 q\).*wide uncertainty/)).toBeInTheDocument();
    expect(screen.getByText(/\+0\.1 to/i)).toBeInTheDocument();
    expect(screen.getByText("Cambridge offer holder avg")).toBeInTheDocument();
  });

  it("marks extrapolated module ceilings as estimated", () => {
    render(
      <ModuleScoreCard
        label="Chemistry"
        result={makeResult({
          module: "chemistry",
          isCeilingExtrapolated: true,
        })}
      />,
    );

    const badge = screen.getByText("estimated");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      "title",
      expect.stringContaining("extrapolated"),
    );
  });

  it("uses a single band headline when the score range stays inside one band", () => {
    render(
      <ModuleScoreCard
        label="Mathematics 2"
        result={makeResult({ scaledLow: 4.6, scaledHigh: 5.4 })}
      />,
    );

    expect(screen.getByText("Average")).toHaveClass("sv-band-headline");
  });

  it("names adjacent band crossings, including boundary values", () => {
    render(
      <ModuleScoreCard
        label="Physics"
        result={makeResult({ scaledLow: 4.5, scaledHigh: 5.5 })}
      />,
    );

    expect(screen.getByText(/Average.*Above Average/)).toHaveClass(
      "sv-band-headline",
    );
  });

  it("collapses broad multi-band ranges into a wide-range headline", () => {
    render(
      <ModuleScoreCard
        label="Biology"
        result={makeResult({ scaledLow: 4.4, scaledHigh: 7.1 })}
      />,
    );

    const card = screen.getByText("Biology").closest(".sv-card");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Wide range")).toHaveClass(
      "sv-band-headline",
    );
  });
});
