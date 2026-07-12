import { Link } from "react-router-dom";
import {
  prefetchRevisionContent,
  revisionDocs,
  revisionModules,
} from "../../content/revision/manifest";
import { ampersandize } from "../../content/revision/textFormat";
import type { RevisionModule } from "../../content/revision/types";
import {
  useModuleSummary,
  useRecentTopics,
} from "../../store/revisionProgress";
import { RevisionLayout } from "./RevisionLayout";
import { TopicStatusAffix } from "./TopicStatusAffix";

// Built from the actual doc list rather than hand-written, so it can't drift
// out of sync with which topics a module really covers.
function summarizeTopics(titles: string[]): string {
  if (titles.length === 0) return "Guides coming soon.";
  return `${titles.map(ampersandize).join(", ")}.`;
}

function RecentStrip() {
  const recents = useRecentTopics(revisionDocs, 3);
  if (recents.length === 0) {
    return null;
  }

  return (
    <nav className="rev-recents" aria-label="Continue where you left off">
      <span className="rev-recents-label">Continue where you left off</span>
      <div className="rev-recents-links">
        {recents.map((doc) => (
          <Link
            key={doc.id}
            to={`/revision/${doc.meta.module}/${doc.meta.slug}`}
            className="rev-recents-link"
            onMouseEnter={() => prefetchRevisionContent(doc.path)}
            onFocus={() => prefetchRevisionContent(doc.path)}
            onPointerDown={() => prefetchRevisionContent(doc.path)}
          >
            <span className="rev-recents-link-title">
              {ampersandize(doc.meta.title)}
            </span>
            <span className="rev-recents-link-meta">
              <TopicStatusAffix docId={doc.id} />
              <span className="rev-recents-link-code">{doc.meta.topicCode}</span>
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function ModuleColumn({ module }: { module: RevisionModule }) {
  const summary = useModuleSummary(module.docs);

  return (
    <section className="rev-subject-column">
      <div className="rev-subject-column-head">
        <h2>{module.title}</h2>
        <span>
          {summary.total === 0
            ? "0 topics"
            : `${summary.done} of ${summary.total} done`}
        </span>
      </div>
      {summary.total > 0 && (
        <div
          className="rev-module-progress"
          role="progressbar"
          aria-valuenow={Math.round(summary.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${module.title} progress`}
        >
          <span
            className="rev-module-progress-fill"
            style={{ width: `${summary.pct}%` }}
          />
        </div>
      )}
      <p>{summarizeTopics(module.docs.map((doc) => doc.meta.title))}</p>
      <nav className="rev-subject-tree" aria-label={`${module.title} topics`}>
        {module.docs.length === 0 ? (
          <span className="rev-subject-empty">Coming soon</span>
        ) : (
          module.docs.map((doc) => (
            <Link
              key={doc.id}
              to={`/revision/${doc.meta.module}/${doc.meta.slug}`}
              onMouseEnter={() => prefetchRevisionContent(doc.path)}
              onFocus={() => prefetchRevisionContent(doc.path)}
              onPointerDown={() => prefetchRevisionContent(doc.path)}
            >
              <span className="rev-subject-topic-title">
                {ampersandize(doc.meta.title)}
              </span>
              <span className="rev-subject-topic-meta">
                <TopicStatusAffix docId={doc.id} />
                <span className="rev-subject-topic-code">{doc.meta.topicCode}</span>
                <span className="rev-subject-topic-arrow" aria-hidden="true">→</span>
              </span>
            </Link>
          ))
        )}
      </nav>
    </section>
  );
}

export function RevisionHome() {
  return (
    <RevisionLayout>
      <section className="rev-home sk-revision">
        <div className="sk-frame">
          <span className="sk-screw sk-screw--tl" />
          <span className="sk-screw sk-screw--tr" />
          <span className="sk-screw sk-screw--bl" />
          <span className="sk-screw sk-screw--br" />

          <p className="rev-kicker">ESAT revision</p>
          <h1>Topic guides for fast, clean problem solving.</h1>
          <p className="rev-subtitle">
            A docs-style home for transformed ESAT guide content, shortcut methods, formula
            fluency, worked examples, & practice links.
          </p>

          <RecentStrip />

          <div className="rev-subject-toc">
            {revisionModules.map((module) => (
              <ModuleColumn key={module.slug} module={module} />
            ))}
          </div>
        </div>
      </section>
    </RevisionLayout>
  );
}
