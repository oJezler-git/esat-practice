import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Nav } from "./components/ui/Nav";
import { KeyboardShortcutOverlay } from "./components/ui/KeyboardShortcutOverlay";
import { useSettingsStore } from "./lib/settingsStore";
import Home from "./pages/home";
import PracticeSetup from "./pages/practice-setup";
import SessionPage from "./pages/session";
import ResultsPage from "./pages/results";
import QuestionBank from "./pages/question-bank";
import Progress from "./pages/progress";
import Settings from "./pages/settings";

export default function App() {
  const fontPreset = useSettingsStore((state) => state.settings.fontPreset);

  useEffect(() => {
    document.documentElement.dataset.fontPreset = fontPreset;
  }, [fontPreset]);

  return (
    <>
      <Nav />
      <KeyboardShortcutOverlay />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/practice" element={<PracticeSetup />} />
        <Route path="/session/:id" element={<SessionPage />} />
        <Route path="/results/:id" element={<ResultsPage />} />
        <Route path="/question-bank" element={<QuestionBank />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </>
  );
}
