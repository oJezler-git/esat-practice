import { Link } from "react-router-dom";
import { prefetchRevisionContent, revisionModules } from "../../content/revision/manifest";
import { RevisionLayout } from "./RevisionLayout";

export function RevisionHome() {
  return (
    <RevisionLayout>
      <section className="rev-home">
        <p className="rev-kicker">ESAT revision</p>
        <h1>Topic guides for fast, clean problem solving.</h1>
        <p className="rev-subtitle">
          A docs-style home for transformed ESAT guide content, shortcut methods, formula fluency,
          worked examples, and practice links.
        </p>

        <p className="rev-home-prompt">Choose a subject, then open a topic guide.</p>

        <div className="rev-subject-toc">
          {revisionModules.map((module) => (
            <section key={module.slug} className="rev-subject-column">
              <div className="rev-subject-column-head">
                <h2>{module.title}</h2>
                <span>{module.docs.length} topic{module.docs.length === 1 ? "" : "s"}</span>
              </div>
              <p>{module.description}</p>
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
                      <span className="rev-subject-topic-main">
                        <span>{doc.meta.title}</span>
                        <span>{doc.meta.topicCode}</span>
                      </span>
                      <span className="rev-subject-topic-action">Open guide</span>
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
