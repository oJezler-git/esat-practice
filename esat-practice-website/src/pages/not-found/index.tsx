import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <section className="max-w-3xl mx-auto px-4 py-20">
      <div className="panel">
        <p className="text-sm text-muted mb-2">404</p>
        <h1 className="text-3xl font-medium mb-3">This page does not exist</h1>
        <p className="text-secondary max-w-sm">
          The link may be old, or the page may have moved. You can continue from home.
        </p>
        <div className="mt-6">
          <Link to="/" className="btn-primary">
            Go to home
          </Link>
        </div>
      </div>
    </section>
  );
}
