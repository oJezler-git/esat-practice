import { Link } from "react-router-dom";
import { computeModuleResult, moduleForTopic } from "../../lib/esatScaling";
import type { TopicStat } from "../../types/schema";
import { ModuleScoreCard } from "./ModuleScoreCard";

interface Props {
  stats: TopicStat[];
}

export function EsatAllTimePanel({ stats }: Props) {
  const groups = {
    m1: { correct: 0, total: 0 },
    m2: { correct: 0, total: 0 },
    physics: { correct: 0, total: 0 },
    chemistry: { correct: 0, total: 0 },
    biology: { correct: 0, total: 0 },
  };

  for (const stat of stats) {
    const mod = moduleForTopic(stat.topic);
    if (mod === "unclassified") continue;
    groups[mod].correct += stat.correct;
    groups[mod].total   += stat.attempts;
  }

  const m1Result        = groups.m1.total        > 0 ? computeModuleResult(groups.m1.correct,        groups.m1.total,        "maths1")    : null;
  const m2Result        = groups.m2.total        > 0 ? computeModuleResult(groups.m2.correct,        groups.m2.total,        "maths2")    : null;
  const physicsResult   = groups.physics.total   > 0 ? computeModuleResult(groups.physics.correct,   groups.physics.total,   "physics")   : null;
  const chemistryResult = groups.chemistry.total > 0 ? computeModuleResult(groups.chemistry.correct, groups.chemistry.total, "chemistry") : null;
  const biologyResult   = groups.biology.total   > 0 ? computeModuleResult(groups.biology.correct,   groups.biology.total,   "biology")   : null;

  if (!m1Result && !m2Result && !physicsResult && !chemistryResult && !biologyResult) return null;

  return (
    <section className="prog-section card">
      <div className="prog-section-head">
        <h2 className="prog-section-title">ESAT scaled score estimate</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">All-time · across all sessions</span>
          <Link to="/score-reference" className="text-xs text-muted hover:text-secondary transition-colors underline underline-offset-2 decoration-dotted">
            How is this calculated?
          </Link>
        </div>
      </div>

      <div className="sv-module-grid">
        {m1Result        && <ModuleScoreCard result={m1Result}        label="Mathematics 1" />}
        {m2Result        && <ModuleScoreCard result={m2Result}        label="Mathematics 2" />}
        {physicsResult   && <ModuleScoreCard result={physicsResult}   label="Physics"        />}
        {chemistryResult && <ModuleScoreCard result={chemistryResult} label="Chemistry"      />}
        {biologyResult   && <ModuleScoreCard result={biologyResult}   label="Biology"        />}
      </div>
    </section>
  );
}
