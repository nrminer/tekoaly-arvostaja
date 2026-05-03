import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "@/index.css";
import App from "@/App";
import { I18nProvider } from "@/i18n";

const InterviewPage = lazy(() => import("@/pages/InterviewPage"));

function RouteLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div
        className="rounded-2xl border bg-card px-5 py-4 text-sm shadow-sm"
        role="status"
        aria-live="polite"
        data-testid="route-loading-indicator"
      >
        Loading…
      </div>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/interview" element={<InterviewPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>,
);
