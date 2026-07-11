import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  reloadPage?: () => void;
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
    const reloadPage = this.props.reloadPage ?? (() => window.location.reload());
    if (error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="error-boundary">
          <div className="error-boundary__card">
            <div className="error-boundary__head">
              <h1 className="error-boundary__title">Something went wrong</h1>
              <p className="error-boundary__desc">
                An unexpected error occurred. You can try again or reload the page.
              </p>
            </div>
            <pre className="error-boundary__message">{error.message}</pre>
            <div className="error-boundary__actions">
              <button type="button" className="btn-primary error-boundary__btn" onClick={this.reset}>
                Try again
              </button>
              <button
                type="button"
                className="btn-primary error-boundary__btn error-boundary__btn--secondary"
                onClick={reloadPage}
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
