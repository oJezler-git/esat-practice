import { moduleForTopic } from "../../lib/esatScaling";
import type { Attempt, Question } from "../../types/schema";

interface ReviewItem {
  question: Question;
  attempt: Attempt;
}

interface TopicStats {
  topic: string;
  correct: number;
  total: number;
}

interface ModuleTopics {
  label: string;
  topics: TopicStats[];
}

function collectModuleTopics(items: ReviewItem[], prefix: "M" | "MM" | "P" | "C" | "B"): TopicStats[] {
  const map = new Map<string, TopicStats>();
  for (const { question, attempt } of items) {
    const topic = question.taxonomy.primary_topic;
    const mod = moduleForTopic(topic);
    const belongs =
      (prefix === "MM" && mod === "m2") ||
      (prefix === "M"  && mod === "m1") ||
      (prefix === "P"  && mod === "physics") ||
      (prefix === "C"  && mod === "chemistry") ||
      (prefix === "B"  && mod === "biology");
    if (!belongs) continue;
    const entry = map.get(topic) ?? { topic, correct: 0, total: 0 };
    entry.total++;
    if (attempt.result === "correct") entry.correct++;
    map.set(topic, entry);
  }
  return [...map.values()].sort((a, b) => a.correct / a.total - b.correct / b.total);
}

interface TopicModuleBreakdownProps {
  items: ReviewItem[];
}

export function TopicModuleBreakdown({ items }: TopicModuleBreakdownProps) {
  const groups: ModuleTopics[] = [
    { label: "Mathematics 1",  topics: collectModuleTopics(items, "M")  },
    { label: "Mathematics 2",  topics: collectModuleTopics(items, "MM") },
    { label: "Physics",        topics: collectModuleTopics(items, "P")  },
    { label: "Chemistry",      topics: collectModuleTopics(items, "C")  },
    { label: "Biology",        topics: collectModuleTopics(items, "B")  },
  ].filter((g) => g.topics.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="sv-breakdown">
      <div className="sv-breakdown-title">Topic breakdown</div>
      {groups.map((group) => {
        const weakest = group.topics.reduce((w, t) =>
          t.correct / t.total < w.correct / w.total ? t : w,
        );
        return (
          <div key={group.label} className="sv-module-group">
            <div className="sv-module-group-label">{group.label}</div>
            {group.topics.map((t) => {
              const pct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
              const isWeak = t === weakest && t.total > 0 && pct < 70;
              const barColor = pct >= 70 ? "green" : pct >= 40 ? "amber" : "red";
              return (
                <div key={t.topic}>
                  <div className="sv-topic-row">
                    <span className={`sv-topic-name${isWeak ? " sv-topic-name--weak" : ""}`}>
                      {t.topic}{isWeak ? " ★" : ""}
                    </span>
                    <span className="sv-topic-stat">
                      {t.correct}/{t.total} ({pct}%)
                    </span>
                  </div>
                  <div className="sv-topic-bar">
                    <div
                      className={`sv-topic-bar-fill sv-topic-bar-fill--${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
