interface JsonPanelProps {
  title: string;
  data: unknown;
  open?: boolean;
}

export function JsonPanel({ title, data, open = false }: JsonPanelProps) {
  return (
    <details className="json-panel" open={open}>
      <summary>{title}</summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}
