import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { getRevisionModule } from "../../content/revision/manifest";
import type { RevisionDoc, RevisionHeading } from "../../content/revision/types";
import { useActiveHeading } from "./useActiveHeading";

export function RevisionLayout({
  children,
  currentDoc,
  headings = [],
}: {
  children: ReactNode;
  currentDoc?: RevisionDoc;
  headings?: RevisionHeading[];
}) {
  const activeHeading = useActiveHeading(headings);
  const currentModule = currentDoc ? getRevisionModule(currentDoc.meta.module) : undefined;
  const activeDocId = currentDoc?.id;

  return (
    <div className={`rev-shell ${currentDoc ? "rev-shell--doc" : "rev-shell--home"}`}>
      {currentModule && (
        <aside className="rev-sidebar" aria-label={`${currentModule.title} revision topics`}>
          <div className="rev-sidebar-inner">
            <NavLink to="/revision" end className="rev-sidebar-home">
              All subjects
            </NavLink>
            <section className="rev-sidebar-module">
              <div className="rev-sidebar-module-title">{currentModule.title}</div>
              <nav className="rev-sidebar-links">
                {currentModule.docs.map((doc) => (
                  <NavLink
                    key={doc.id}
                    to={`/revision/${doc.meta.module}/${doc.meta.slug}`}
                    className={({ isActive }) =>
                      `rev-sidebar-link ${isActive || activeDocId === doc.id ? "rev-sidebar-link--active" : ""}`
                    }
                  >
                    <span>{doc.meta.title}</span>
                    <span className="rev-sidebar-code">{doc.meta.topicCode}</span>
                  </NavLink>
                ))}
              </nav>
            </section>
          </div>
        </aside>
      )}

      <main className="rev-main">{children}</main>

      {currentDoc && (
        <aside className="rev-toc" aria-label="On this page">
          <div className="rev-toc-inner">
            <div className="rev-toc-heading">On this page</div>
            {headings.length === 0 ? (
              <p className="rev-toc-empty">Loading sections...</p>
            ) : (
              <nav>
                {headings.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    className={`rev-toc-link rev-toc-link--h${heading.level} ${
                      activeHeading === heading.id ? "rev-toc-link--active" : ""
                    }`}
                  >
                    {heading.text}
                  </a>
                ))}
              </nav>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
