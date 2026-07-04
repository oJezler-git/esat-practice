import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ZoomableImage } from "../question/ZoomableImage";

type Tone = "note" | "tip" | "shortcut" | "trap";

function calloutLabel(tone: Tone): string {
  switch (tone) {
    case "tip": return "Tip";
    case "shortcut": return "Shortcut";
    case "trap": return "Trap";
    default: return "Note";
  }
}

function Callout({
  children,
  tone = "note",
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <aside className={`rev-callout rev-callout--${tone}`}>
      <div className="rev-callout-title">{title ?? calloutLabel(tone)}</div>
      <div className="rev-callout-body">{children}</div>
    </aside>
  );
}

function Tip(props: Omit<ComponentPropsWithoutRef<typeof Callout>, "tone">) {
  return <Callout {...props} tone="tip" />;
}

function Shortcut(props: Omit<ComponentPropsWithoutRef<typeof Callout>, "tone">) {
  return <Callout {...props} tone="shortcut" />;
}

function Trap(props: Omit<ComponentPropsWithoutRef<typeof Callout>, "tone">) {
  return <Callout {...props} tone="trap" />;
}

function WorkedExample({
  children,
  title = "Worked example",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="rev-worked-example">
      <div className="rev-worked-example-title">{title}</div>
      <div className="rev-worked-example-body">{children}</div>
    </section>
  );
}

function FormulaCard({
  children,
  title = "Formula",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="rev-formula-card">
      <div className="rev-formula-card-title">{title}</div>
      <div className="rev-formula-card-body">{children}</div>
    </section>
  );
}

function Diagram({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="rev-diagram">
      <ZoomableImage
        src={src}
        alt={alt}
        previewButtonClassName="rev-diagram-preview"
        previewImageClassName="rev-diagram-image"
        previewFooter={
          caption ? <figcaption className="rev-diagram-caption">{caption}</figcaption> : undefined
        }
      />
    </figure>
  );
}

function PracticeLink({
  topic,
  children,
}: {
  topic?: string;
  children?: ReactNode;
}) {
  const query = topic ? `?topic=${encodeURIComponent(topic)}` : "";

  return (
    <div className="rev-practice-link">
      <div>
        <div className="rev-practice-link-title">Ready to drill it?</div>
        <p>Use the question bank to find matching past-paper questions.</p>
      </div>
      <Link to={`/question-bank${query}`} className="rev-practice-link-button">
        {children ?? "Open bank"}
      </Link>
    </div>
  );
}

export const revisionMdxComponents = {
  Callout,
  Tip,
  Shortcut,
  Trap,
  WorkedExample,
  FormulaCard,
  Diagram,
  PracticeLink,
  a: (props: ComponentPropsWithoutRef<"a">) => <a {...props} className="rev-link" />,
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="rev-table-wrap">
      <table {...props} className="rev-table" />
    </div>
  ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => <pre {...props} className="rev-code-block" />,
  code: (props: ComponentPropsWithoutRef<"code">) => <code {...props} className="rev-inline-code" />,
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote {...props} className="rev-blockquote" />
  ),
};
