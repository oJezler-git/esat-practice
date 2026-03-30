import { ReactNode } from "react";

interface SectionPanelProps {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SectionPanel({
  title,
  hint,
  defaultOpen = false,
  children,
}: SectionPanelProps) {
  return (
    <details className="section-panel" open={defaultOpen}>
      <summary>
        <span className="section-title">{title}</span>
        {hint ? <span className="section-hint">{hint}</span> : null}
      </summary>
      <div className="section-content">{children}</div>
    </details>
  );
}
