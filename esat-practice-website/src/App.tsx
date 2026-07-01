import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Nav } from "./components/ui/Nav";
import { KeyboardShortcutOverlay } from "./components/ui/KeyboardShortcutOverlay";
import { UpdatePrompt } from "./components/ui/UpdatePrompt";
import { LoadingProgressDisplay } from "./components/LoadingProgressDisplay";
import { useSettingsStore } from "./lib/settingsStore";
import Home from "./pages/home";
import PracticeSetup from "./pages/practice-setup";
import SessionPage from "./pages/session";
import ResultsPage from "./pages/results";
import QuestionBank from "./pages/question-bank";
import Progress from "./pages/progress";
import History from "./pages/history";
import Settings from "./pages/settings";
import NotFound from "./pages/not-found";
import ScoreReference from "./pages/score-reference";
import RevisionHome from "./pages/revision";
import RevisionDocPage from "./pages/revision/doc";

export default function App() {
  const fontPreset = useSettingsStore((state) => state.settings.fontPreset);
  const theme = useSettingsStore((state) => state.settings.theme);
  const location = useLocation();
  const isSession = location.pathname.startsWith("/session/");

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
      </main>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
