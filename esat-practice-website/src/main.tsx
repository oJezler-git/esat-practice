import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ensureBundledQuestionsBootstrapped } from "./lib/loader";
import { recomputeAllStats } from "./lib/statsStore";
import { registerDebugCommands } from "./lib/debug";
import "katex/dist/katex.min.css";
import "./styles.css";

// Reload whenever a new service worker takes control — covers mobile browsers
// where the waiting SW may activate before the user taps the update button,
// which leaves registration.waiting null and makes updateServiceWorker() a no-op.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

// Questions must be loaded before stats can be derived (the aggregator joins
// attempts to question topics). Rebuilding stats from the attempts store on
// every start keeps them self-healing and consistent with the source of truth.
void ensureBundledQuestionsBootstrapped()
  .then(() => recomputeAllStats())
  .catch((error: unknown) => {
    console.error("Failed to bootstrap questions or recompute stats", error);
  });

registerDebugCommands();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
