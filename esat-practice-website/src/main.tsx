import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ensureBundledQuestionsBootstrapped } from "./lib/loader";
import { registerDebugCommands } from "./lib/debug";
import "./styles.css";

// Reload whenever a new service worker takes control — covers mobile browsers
// where the waiting SW may activate before the user taps the update button,
// which leaves registration.waiting null and makes updateServiceWorker() a no-op.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

void ensureBundledQuestionsBootstrapped().catch((error: unknown) => {
  console.error("Failed to bootstrap questions", error);
});

registerDebugCommands();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
