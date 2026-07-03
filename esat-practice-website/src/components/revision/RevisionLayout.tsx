import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { getRevisionModule, prefetchRevisionContent } from "../../content/revision/manifest";
import { ampersandize } from "../../content/revision/textFormat";
import type { RevisionDocEntry, RevisionHeading, RevisionModule } from "../../content/revision/types";
import { RevisionAsk } from "./RevisionAsk";
import { useActiveHeading } from "./useActiveHeading";
import { useExitTransition } from "./useExitTransition";

type DisplayedHeadings = { id: string; headings: RevisionHeading[] };

function TopicNavLinks({
  module,
  activeDocId,
  onNavigate,
}: {
  module: RevisionModule;
  activeDocId?: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="rev-sidebar-inner">
      <NavLink to="/revision" end className="rev-sidebar-home" onClick={onNavigate}>
        All subjects
      </NavLink>
      <section className="rev-sidebar-module">
        <div className="rev-sidebar-module-title">
          <span className={`rev-module-dot rev-module-dot--${module.slug}`} aria-hidden="true" />
          {module.title}
        </div>
        <nav className="rev-sidebar-links">
          {module.docs.map((doc) => (
            <NavLink
              key={doc.id}
              to={`/revision/${doc.meta.module}/${doc.meta.slug}`}
              onMouseEnter={() => prefetchRevisionContent(doc.path)}
              onFocus={() => prefetchRevisionContent(doc.path)}
              onPointerDown={() => prefetchRevisionContent(doc.path)}
              onClick={onNavigate}
              className={({ isActive }) =>
                `rev-sidebar-link ${isActive || activeDocId === doc.id ? "rev-sidebar-link--active" : ""}`
              }
            >
              <span>{ampersandize(doc.meta.title)}</span>
              <span className="rev-sidebar-code">{doc.meta.topicCode}</span>
            </NavLink>
          ))}
        </nav>
      </section>
    </div>
  );
}

export function RevisionLayout({
  children,
  currentDoc,
  headings = [],
}: {
  children: ReactNode;
  currentDoc?: RevisionDocEntry;
  headings?: RevisionHeading[];
}) {
  const [activeHeading, setActiveHeading] = useActiveHeading(headings);
  const currentModule = currentDoc ? getRevisionModule(currentDoc.meta.module) : undefined;
  const activeDocId = currentDoc?.id;
  // Memoized so identity is stable across renders where headings/activeDocId
  // haven't actually changed — useExitTransition re-syncs whenever this
  // reference changes, so a fresh literal every render would loop forever.
  const headingsValue: DisplayedHeadings | null = useMemo(
    () => (headings.length > 0 && activeDocId ? { id: activeDocId, headings } : null),
    [headings, activeDocId],
  );
  // The TOC fades out its old links instead of snapping to "Loading sections..."
  // the instant the route settles on a new topic.
  const { display: displayedHeadings, exiting: tocExiting } = useExitTransition(
    headingsValue,
    activeDocId,
    150,
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNavClosing, setMobileNavClosing] = useState(false);

  const closeMobileNav = (animate = true) => {
    if (!animate) {
      setMobileNavOpen(false);
      setMobileNavClosing(false);
      return;
    }
    setMobileNavClosing(true);
    window.setTimeout(() => {
      setMobileNavOpen(false);
      setMobileNavClosing(false);
    }, 200); // matches rev-mobile-nav-out duration
  };

  // Close the mobile topic drawer whenever the route settles on a new doc
  // (the page itself is transitioning, so no exit animation is needed here).
  useEffect(() => {
    closeMobileNav(false);
  }, [activeDocId]);

  return (
    <div className={`rev-shell ${currentDoc ? "rev-shell--doc" : "rev-shell--home"}`}>
      {currentModule && (
        <>
          <button
            type="button"
            className="rev-mobile-nav-trigger"
            onClick={() => {
              setMobileNavOpen(true);
              setMobileNavClosing(false);
            }}
            aria-haspopup="true"
            aria-expanded={mobileNavOpen}
          >
            <span className="rev-mobile-nav-trigger-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className={`rev-module-dot rev-module-dot--${currentModule.slug}`} aria-hidden="true" />
            <span>{currentModule.title} topics</span>
          </button>

          <aside className="rev-sidebar" aria-label={`${currentModule.title} revision topics`}>
            <TopicNavLinks module={currentModule} activeDocId={activeDocId} />
          </aside>

          {mobileNavOpen && (
            <div
              className={`rev-mobile-nav-overlay ${mobileNavClosing ? "rev-mobile-nav-overlay--closing" : ""}`}
              onClick={(event) => {
                if (event.target === event.currentTarget) closeMobileNav();
              }}
            >
              <div className="rev-mobile-nav-panel" role="dialog" aria-modal="true" aria-label={`${currentModule.title} revision topics`}>
                <div className="rev-mobile-nav-panel-header">
                  <span>
                    <span className={`rev-module-dot rev-module-dot--${currentModule.slug}`} aria-hidden="true" />
                    {currentModule.title}
                  </span>
                  <button
                    type="button"
                    className="rev-mobile-nav-close"
                    onClick={() => closeMobileNav()}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <TopicNavLinks
                  module={currentModule}
                  activeDocId={activeDocId}
                  onNavigate={() => closeMobileNav(false)}
                />
              </div>
            </div>
          )}
        </>
      )}

      <main className="rev-main">{children}</main>

      {currentDoc && (
        <aside className="rev-toc" aria-label="On this page">
          <div className="rev-toc-inner">
            <div className="rev-toc-heading">On this page</div>
            {displayedHeadings === null ? (
              <p className="rev-toc-empty">Loading sections...</p>
            ) : (
              <nav
                key={displayedHeadings.id}
                className={tocExiting ? "rev-toc-exit" : undefined}
              >
                {displayedHeadings.headings.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    onClick={() => setActiveHeading(heading.id)}
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

      {currentDoc && (
        <RevisionAsk
          moduleSlug={currentDoc.meta.module}
          topicSlug={currentDoc.meta.slug}
          docId={currentDoc.id}
        />
      )}
    </div>
  );
}
