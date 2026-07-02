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
import type { RevisionHeading } from "../../content/revision/types";
import { preloadKatexFonts } from "./katexFontPreload";
import { revisionMdxComponents } from "./RevisionMdxComponents";
import { RevisionLayout } from "./RevisionLayout";
import { useCopy } from "./useCopy";

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
  // when that id matches the current route, so navigating to another topic drops
  // to the skeleton on the very next paint — no stale content, and the heavy new
  // guide is never rendered in the same commit as the click.
  const [loaded, setLoaded] = useState<{ id: string; Content: ComponentType<any> } | null>(null);
  const ready = loaded && loaded.id === docId ? loaded : null;

  // Warm the KaTeX fonts as soon as a guide is opened so math never pops in.
  useEffect(() => {
    preloadKatexFonts();
  }, []);

  // Fetch the compiled MDX guide for the current topic on demand.
  useEffect(() => {
    if (!docPath || !docId) {
      return;
    }

    let cancelled = false;
    setHeadings([]);

    loadRevisionContent(docPath)
      .then((Content) => {
        if (cancelled) {
          return;
        }
        // Defer the heavy MDX render to the next frame so the skeleton paints
        // first and the click feels instant, even when the chunk is warm.
        requestAnimationFrame(() => {
          if (!cancelled) {
            setLoaded({ id: docId, Content });
          }
        });
      })
      .catch(() => {
        // Leave the skeleton in place on failure.
      });

    return () => {
      cancelled = true;
    };
  }, [docPath, docId]);

  // Build the table of contents once the guide has rendered.
  useEffect(() => {
    if (ready) {
      setHeadings(collectHeadings(articleRef.current));
    }
  }, [ready, docId]);

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

  const module = getRevisionModule(doc.meta.module);

  return (
    <RevisionLayout currentDoc={doc} headings={headings}>
      <article ref={articleRef} className="rev-article">
        <div className="rev-breadcrumb">
          <Link to="/revision">Revision</Link>
          <span>/</span>
          <span>{module.shortTitle}</span>
        </div>

        <div className="rev-title-row">
          <div>
            <p className="rev-kicker">{doc.meta.topicCode} · {module.title}</p>
            <h1>{doc.meta.title}</h1>
          </div>
          <button type="button" className="rev-copy-btn" onClick={copy}>
            {copied ? "Copied" : "Copy page"}
          </button>
        </div>
        <p className="rev-subtitle">{doc.meta.subtitle}</p>
        <div className="rev-meta-row">
          <span>{doc.meta.estimatedMinutes} min read</span>
        </div>

        <div className="rev-mdx">
          {ready ? (
            <ready.Content components={revisionMdxComponents} />
          ) : (
            <div className="rev-mdx-skeleton" aria-hidden="true">
              <span className="rev-skel-line rev-skel-line--head" />
              <span className="rev-skel-line" />
              <span className="rev-skel-line" />
              <span className="rev-skel-line rev-skel-line--short" />
              <span className="rev-skel-line rev-skel-line--head" />
              <span className="rev-skel-line" />
              <span className="rev-skel-line rev-skel-line--short" />
            </div>
          )}
        </div>
      </article>
    </RevisionLayout>
  );
}
