import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            background: "var(--bg-canvas)",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              width: "100%",
              background: "var(--surface-1)",
              border: "1px solid var(--danger-border)",
              borderRadius: "1rem",
              padding: "2rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Something went wrong
              </p>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
                An unexpected error occurred. You can try again or reload the page.
              </p>
            </div>
            <pre
              style={{
                margin: 0,
                padding: "0.75rem 1rem",
                background: "var(--danger-soft)",
                border: "1px solid var(--danger-border)",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error.message}
            </pre>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button type="button" className="btn-primary" onClick={this.reset} style={{ flex: 1 }}>
                Try again
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => window.location.reload()}
                style={{
                  flex: 1,
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "none",
                }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
