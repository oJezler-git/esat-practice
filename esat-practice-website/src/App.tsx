import { Suspense, lazy, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Nav } from "./components/ui/Nav";
import { KeyboardShortcutOverlay } from "./components/ui/KeyboardShortcutOverlay";
import { UpdatePrompt } from "./components/ui/UpdatePrompt";
import { LoadingProgressDisplay } from "./components/LoadingProgressDisplay";
import { useSettingsStore } from "./lib/settingsStore";
import { sweepStaleActiveSessions } from "./lib/sessionStore";

const Home = lazy(() => import("./pages/home"));
const PracticeSetup = lazy(() => import("./pages/practice-setup"));
const SessionPage = lazy(() => import("./pages/session"));
const ResultsPage = lazy(() => import("./pages/results"));
const QuestionBank = lazy(() => import("./pages/question-bank"));
const Progress = lazy(() => import("./pages/progress"));
const History = lazy(() => import("./pages/history"));
const Settings = lazy(() => import("./pages/settings"));
const NotFound = lazy(() => import("./pages/not-found"));
const ScoreReference = lazy(() => import("./pages/score-reference"));
const RevisionHome = lazy(() => import("./pages/revision"));
const RevisionDocPage = lazy(() => import("./pages/revision/doc"));

export default function App() {
  const fontPreset = useSettingsStore((state) => state.settings.fontPreset);
  const theme = useSettingsStore((state) => state.settings.theme);
  const colorTheme = useSettingsStore((state) => state.settings.colorTheme);
  const location = useLocation();
  const isSession = location.pathname.startsWith("/session/");

  // React Router doesn't reset scroll position on navigation, so leaving a
  // long page (e.g. a revision guide) scrolled down and following a link
  // lands the next page mid-scroll — on a virtualized list like the question
  // bank this renders whatever rows fall at that stale scrollY, which reads
  // as jumping straight to the bottom of the list.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    void sweepStaleActiveSessions();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.fontPreset = fontPreset;
  }, [fontPreset]);

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.dataset.theme = "light";
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [theme]);

  useEffect(() => {
    // "amber" is the default palette authored at :root, so it needs no attribute.
    if (colorTheme && colorTheme !== "amber") {
      document.documentElement.dataset.colorTheme = colorTheme;
    } else {
      delete document.documentElement.dataset.colorTheme;
    }
  }, [colorTheme]);

  return (
    <>
      <a href="#app-main" className="skip-link">
        Skip to content
      </a>
      <Nav isHidden={isSession} />
      <KeyboardShortcutOverlay />
      <LoadingProgressDisplay />
      <UpdatePrompt />
      <main id="app-main" className={`app-main ${isSession ? "h-screen overflow-hidden" : ""}`}>
        <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/practice" element={<PracticeSetup />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/results/:id" element={<ResultsPage />} />
          <Route path="/question-bank" element={<QuestionBank />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/score-reference" element={<ScoreReference />} />
          <Route path="/revision" element={<RevisionHome />} />
          <Route path="/revision/:moduleSlug/:topicSlug" element={<RevisionDocPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </main>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
