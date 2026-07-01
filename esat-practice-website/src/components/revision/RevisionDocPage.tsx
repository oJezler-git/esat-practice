import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { findRevisionDoc, getRevisionModule } from "../../content/revision/manifest";
import { buildUniqueHeadingId } from "../../content/revision/slug";
import type { RevisionHeading } from "../../content/revision/types";
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

  useEffect(() => {
    setHeadings(collectHeadings(articleRef.current));
  }, [doc?.id]);

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
  const { copied, copy } = useCopy(stripMdxExports(doc.raw));
  const Content = doc.Content;

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
          <Content components={revisionMdxComponents} />
        </div>
      </article>
    </RevisionLayout>
  );
}

export function stripMdxExports(raw: string): string {
  const marker = "export const meta = {";
  const start = raw.indexOf(marker);
  if (start === -1) {
    return raw.trim();
  }

  let depth = 0;
  let end = start + marker.length - 1;
  for (; end < raw.length; end += 1) {
    if (raw[end] === "{") {
      depth += 1;
    } else if (raw[end] === "}") {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  if (raw[end] === ";") {
    end += 1;
  }

  return raw.slice(end).trim();
}
