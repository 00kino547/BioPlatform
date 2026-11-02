import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import i18n, { initI18n } from "./i18n";

// Initialise i18n synchronously so the first paint already uses the best-guess
// locale (stored preference → Accept-Language → default). The instance config
// gate inside <App> re-targets it once GET /api/config resolves.
initI18n();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </ErrorBoundary>
  </StrictMode>
);
