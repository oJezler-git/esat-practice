import { computeModuleResult, detectModuleGroups } from "../../lib/esatScaling";
import type { Attempt, Question } from "../../types/schema";
import { AccuracyHistoryChart } from "./AccuracyHistoryChart";
import { ModuleScoreCard } from "./ModuleScoreCard";
import { TopicModuleBreakdown } from "./TopicModuleBreakdown";

export interface ReviewItem {
  question: Question;
  attempt: Attempt;
}

interface EsatScorePanelProps {
  items: ReviewItem[];
}

export function EsatScorePanel({ items }: EsatScorePanelProps) {
  const groups = detectModuleGroups(items);

  const m1Result     = groups.m1.total     > 0 ? computeModuleResult(groups.m1.correct,     groups.m1.total,     "maths1")  : null;
  const m2Result     = groups.m2.total     > 0 ? computeModuleResult(groups.m2.correct,     groups.m2.total,     "maths2")  : null;
  const physicsResult = groups.physics.total > 0 ? computeModuleResult(groups.physics.correct, groups.physics.total, "physics") : null;

  if (!m1Result && !m2Result && !physicsResult) {
    return (
      <div className="sv-panel">
        <div className="sv-empty">
          No classifiable questions found — topic prefixes did not match ESAT modules.
        </div>
      </div>
    );
  }

  const attempted = items.filter((i) => i.attempt.result !== "skipped");
  const correct   = attempted.filter((i) => i.attempt.result === "correct");
  const currentAccuracy = attempted.length > 0 ? correct.length / attempted.length : 0;

  return (
    <div className="sv-panel">
      <div className="sv-module-grid">
        {m1Result     && <ModuleScoreCard result={m1Result}     label="Mathematics 1" />}
        {m2Result     && <ModuleScoreCard result={m2Result}     label="Mathematics 2" />}
        {physicsResult && <ModuleScoreCard result={physicsResult} label="Physics"       />}
      </div>

      <TopicModuleBreakdown items={items} />

      <AccuracyHistoryChart currentAccuracy={currentAccuracy} />
    </div>
  );
}
