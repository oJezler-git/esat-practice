import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, useParams } from "react-router-dom";
// Pre-rendered doc math (and the Ask panel, which only appears on doc pages)
// needs KaTeX styles; scope them to this route instead of loading app-wide.
import "katex/dist/katex.min.css";
import {
  findRevisionDoc,
  getRevisionModule,
  loadRevisionContent,
  loadRevisionRaw,
} from "../../content/revision/manifest";
import { stripMdxExports } from "../../content/revision/mdxSource";
import { buildUniqueHeadingId } from "../../content/revision/slug";
import { ampersandize } from "../../content/revision/textFormat";
import type { RevisionHeading } from "../../content/revision/types";
import {
  useRevisionProgress,
  useTopicProgress,
} from "../../store/revisionProgress";
import { preloadKatexFonts } from "./katexFontPreload";
import { RevisionConfidence } from "./RevisionConfidence";
import { revisionMdxComponents } from "./RevisionMdxComponents";
import { RevisionLayout } from "./RevisionLayout";
import { useCopy } from "./useCopy";
import { useExitTransition } from "./useExitTransition";
import { useScrollProgress } from "./useScrollProgress";

function collectHeadings(root: HTMLElement | null): RevisionHeading[] {
  if (!root) {
    return [];
  }

  const used = new Set<string>();
  return Array.from(root.querySelectorAll("h2, h3")).map((element) => {
    const text = element.textContent?.trim() ?? "";
    const existingId = element.getAttribute("id");
    const id = existingId || buildUniqueHeadingId(text, used);

    if (existingId) {
      used.add(existingId);
    } else {
      element.setAttribute("id", id);
    }

    return {
      id,
      text,
      level: element.tagName.toLowerCase() === "h2" ? 2 : 3,
    };
  });
}

export function RevisionDocPage() {
  const { moduleSlug, topicSlug } = useParams();
  const doc = findRevisionDoc(moduleSlug, topicSlug);
  const articleRef = useRef<HTMLElement | null>(null);
  const [headings, setHeadings] = useState<RevisionHeading[]>([]);
  const docPath = doc?.path;
  const docId = doc?.id;

  // The loaded guide is tagged with the doc id it belongs to. We only render it
  // when that id matches the current route, so navigating to another topic never
  // shows stale content, and the heavy new guide is not rendered in the click's
  // commit.
  const [loaded, setLoaded] = useState<{ id: string; Content: ComponentType<any> } | null>(null);
  // The skeleton only appears once a load is genuinely slow, so near-instant
  // (warm) topics slide straight in without a flash of skeleton.
  const [showSkeleton, setShowSkeleton] = useState(false);
  const ready = loaded && loaded.id === docId ? loaded : null;
  // Instead of the old guide vanishing the instant a new topic is clicked,
  // it plays a brief exit animation while the new one loads/cascades in.
  const { display: displayedContent, exiting: contentExiting } = useExitTransition(ready, docId, 150);
  // Same treatment for the breadcrumb/title/subtitle/meta cluster — doc is
  // already the new topic's data the instant the route changes (it's
  // synchronous, unlike the async guide content), so this only delays the
  // visual swap, not any data fetch.
  const { display: displayedDoc, exiting: headerExiting } = useExitTransition(doc ?? null, docId, 150);

  const recordVisit = useRevisionProgress((state) => state.recordVisit);
  const markDone = useRevisionProgress((state) => state.markDone);
  const { done } = useTopicProgress(docId ?? "");

  // Warm the KaTeX fonts as soon as a guide is opened so math never pops in.
  useEffect(() => {
    preloadKatexFonts();
  }, []);

  // Stamp last-visited (and first-visited once) whenever a topic is opened.
  useEffect(() => {
    if (docId) {
      recordVisit(docId);
    }
  }, [docId, recordVisit]);

  // Track how far the guide has been read once its content has painted.
  useScrollProgress(articleRef, docId, Boolean(displayedContent));

  // Fetch the compiled MDX guide for the current topic on demand.
  useEffect(() => {
    if (!docPath || !docId) {
      return;
    }

    let cancelled = false;
    setHeadings([]);
    setShowSkeleton(false);
    // Reveal the skeleton only if the guide hasn't rendered within this window.
    const skeletonTimer = window.setTimeout(() => {
      if (!cancelled) {
        setShowSkeleton(true);
      }
    }, 150);

    loadRevisionContent(docPath)
      .then((Content) => {
        if (cancelled) {
          return;
        }
        // Defer the heavy MDX render to the next frame so the click feels
        // instant, even when the chunk is warm.
        requestAnimationFrame(() => {
          if (!cancelled) {
            window.clearTimeout(skeletonTimer);
            setLoaded({ id: docId, Content });
            setShowSkeleton(false);
          }
        });
      })
      .catch(() => {
        // Leave the skeleton in place on failure.
      });

    return () => {
      cancelled = true;
      window.clearTimeout(skeletonTimer);
    };
  }, [docPath, docId]);

  // Build the table of contents once the guide has actually painted into the
  // DOM. This must key off `displayedContent` (not `ready`): the exit-transition
  // hook delays the real content by a render, so on the render where `ready`
  // first flips true, articleRef still holds the *previous* (empty) DOM — this
  // effect would run once, find no headings, and never fire again since `ready`
  // and `docId` don't change afterward, leaving the TOC stuck on
  // "Loading sections..." until the next topic navigation resets it.
  useEffect(() => {
    if (displayedContent) {
      setHeadings(collectHeadings(articleRef.current));
    }
  }, [displayedContent, docId]);

  const { copied, copy } = useCopy(async () =>
    docPath ? stripMdxExports(await loadRevisionRaw(docPath)) : "",
  );

  if (!doc) {
    return (
      <RevisionLayout>
        <section className="rev-empty">
          <p className="rev-kicker">Not found</p>
          <h1>That revision page does not exist.</h1>
          <p>The topic may have moved, or it has not been written yet.</p>
          <Link to="/revision" className="rev-empty-link">Back to revision guide</Link>
        </section>
      </RevisionLayout>
    );
  }

  const headerDoc = displayedDoc ?? doc;
  const headerModule = getRevisionModule(headerDoc.meta.module);

  return (
    <RevisionLayout currentDoc={doc} headings={headings}>
      <article ref={articleRef} className="rev-article">
        <div
          key={headerDoc.id}
          className={`rev-header-enter${headerExiting ? " rev-header-exit" : ""}`}
        >
          <div className="rev-breadcrumb">
            <Link to="/revision">Revision</Link>
            <span>/</span>
            <span>{headerModule.shortTitle}</span>
          </div>

          <div className="rev-title-row">
            <div>
              <p className="rev-kicker">{headerDoc.meta.topicCode} · {headerModule.title}</p>
              <h1>{ampersandize(headerDoc.meta.title)}</h1>
            </div>
            <div className="rev-title-actions">
              <button
                type="button"
                className={`rev-done-btn ${done ? "rev-done-btn--active" : ""}`}
                onClick={() => docId && markDone(docId, !done)}
                aria-pressed={done}
              >
                {done ? "Done ✓" : "Mark as done"}
              </button>
              <button type="button" className="rev-copy-btn" onClick={copy}>
                {copied ? "Copied" : "Copy page"}
              </button>
            </div>
          </div>
          <p className="rev-subtitle">{headerDoc.meta.subtitle}</p>
          <div className="rev-meta-row">
            <span>{headerDoc.meta.estimatedMinutes} min read</span>
          </div>
        </div>

        <div className="rev-mdx">
          {displayedContent ? (
            <div
              key={displayedContent.id}
              className={`rev-mdx-enter${contentExiting ? " rev-mdx-exit" : ""}`}
            >
              <displayedContent.Content components={revisionMdxComponents} />
            </div>
          ) : showSkeleton ? (
            <div className="rev-mdx-skeleton" aria-hidden="true">
              <span className="rev-skel-line rev-skel-line--head" />
              <span className="rev-skel-line" />
              <span className="rev-skel-line" />
              <span className="rev-skel-line rev-skel-line--short" />
              <span className="rev-skel-line rev-skel-line--head" />
              <span className="rev-skel-line" />
              <span className="rev-skel-line rev-skel-line--short" />
            </div>
          ) : null}
        </div>

        {displayedContent && <RevisionConfidence docId={doc.id} />}
      </article>
    </RevisionLayout>
  );
}
