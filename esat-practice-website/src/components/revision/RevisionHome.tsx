import { Link } from "react-router-dom";
import { prefetchRevisionContent, revisionModules } from "../../content/revision/manifest";
import { ampersandize } from "../../content/revision/textFormat";
import { RevisionLayout } from "./RevisionLayout";

// Built from the actual doc list rather than hand-written, so it can't drift
// out of sync with which topics a module really covers.
function summarizeTopics(titles: string[]): string {
  if (titles.length === 0) return "Guides coming soon.";
  return `${titles.map(ampersandize).join(", ")}.`;
}

export function RevisionHome() {
  return (
    <RevisionLayout>
      <section className="rev-home">
        <p className="rev-kicker">ESAT revision</p>
        <h1>Topic guides for fast, clean problem solving.</h1>
        <p className="rev-subtitle">
          A docs-style home for transformed ESAT guide content, shortcut methods, formula fluency,
          worked examples, & practice links.
        </p>

        <div className="rev-subject-toc">
          {revisionModules.map((module) => (
            <section key={module.slug} className="rev-subject-column">
              <div className="rev-subject-column-head">
                <h2>
                  <span className={`rev-module-dot rev-module-dot--${module.slug}`} aria-hidden="true" />
                  {module.title}
                </h2>
                <span>{module.docs.length} topic{module.docs.length === 1 ? "" : "s"}</span>
              </div>
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
                      <span className="rev-subject-topic-title">{ampersandize(doc.meta.title)}</span>
                      <span className="rev-subject-topic-meta">
                        <span className="rev-subject-topic-code">{doc.meta.topicCode}</span>
                        <span className="rev-subject-topic-arrow" aria-hidden="true">→</span>
                      </span>
                    </Link>
                  ))
                )}
              </nav>
            </section>
          ))}
        </div>
      </section>
    </RevisionLayout>
  );
}
