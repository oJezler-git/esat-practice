import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import App from "./App";
import { useSettingsStore } from "./lib/settingsStore";
import { DEFAULT_SETTINGS } from "./types/settings";
import { sweepStaleActiveSessions } from "./lib/sessionStore";

const interactionSoundMocks = vi.hoisted(() => {
  const cleanup = vi.fn();
  return {
    cleanup,
    installInteractionSounds: vi.fn(() => cleanup),
    setInteractionSoundVolume: vi.fn(),
    setInteractionSoundsEnabled: vi.fn(),
  };
});

vi.mock("@vercel/analytics/react", () => ({
  Analytics: () => <div data-testid="analytics" />,
}));

vi.mock("@vercel/speed-insights/react", () => ({
  SpeedInsights: () => <div data-testid="speed-insights" />,
}));

vi.mock("./components/ui/KeyboardShortcutOverlay", () => ({
  KeyboardShortcutOverlay: () => <div data-testid="shortcut-overlay" />,
}));

vi.mock("./components/ui/UpdatePrompt", () => ({
  UpdatePrompt: () => <div data-testid="update-prompt" />,
}));

vi.mock("./components/LoadingProgressDisplay", () => ({
  LoadingProgressDisplay: () => <div data-testid="loading-progress" />,
}));

vi.mock("./lib/sessionStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/sessionStore")>();
  return {
    ...actual,
    sweepStaleActiveSessions: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("./lib/interactionSounds", () => ({
  installInteractionSounds: interactionSoundMocks.installInteractionSounds,
  setInteractionSoundVolume: interactionSoundMocks.setInteractionSoundVolume,
  setInteractionSoundsEnabled: interactionSoundMocks.setInteractionSoundsEnabled,
}));

vi.mock("./pages/home", () => ({
  default: () => <div>Home page stub</div>,
}));

vi.mock("./pages/practice-setup", () => ({
  default: () => <div>Practice setup page stub</div>,
}));

vi.mock("./pages/session", () => ({
  default: () => <div>Session page stub</div>,
}));

vi.mock("./pages/results", () => ({
  default: () => <div>Results page stub</div>,
}));

vi.mock("./pages/question-bank", () => ({
  default: () => <div>Question bank page stub</div>,
}));

vi.mock("./pages/progress", () => ({
  default: () => <div>Progress page stub</div>,
}));

vi.mock("./pages/history", () => ({
  default: () => <div>History page stub</div>,
}));

vi.mock("./pages/settings", () => ({
  default: () => <div>Settings page stub</div>,
}));

vi.mock("./pages/score-reference", () => ({
  default: () => <div>Score reference page stub</div>,
}));

vi.mock("./pages/revision", () => ({
  default: () => <div>Revision home page stub</div>,
}));

vi.mock("./pages/revision/doc", () => ({
  default: () => <div>Revision doc page stub</div>,
}));

vi.mock("./pages/not-found", () => ({
  default: () => <div>404 page stub</div>,
}));

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function RouteChanger() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/practice")}>
      Go practice
    </button>
  );
}

describe("App routes and shell", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
    document.documentElement.removeAttribute("data-font-preset");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-color-theme");
    interactionSoundMocks.cleanup.mockClear();
    interactionSoundMocks.installInteractionSounds.mockClear();
    interactionSoundMocks.setInteractionSoundVolume.mockClear();
    interactionSoundMocks.setInteractionSoundsEnabled.mockClear();
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    ["/", "Home page stub"],
    ["/practice", "Practice setup page stub"],
    ["/session/session-1", "Session page stub"],
    ["/results/session-1", "Results page stub"],
    ["/question-bank", "Question bank page stub"],
    ["/progress", "Progress page stub"],
    ["/history", "History page stub"],
    ["/settings", "Settings page stub"],
    ["/score-reference", "Score reference page stub"],
    ["/revision", "Revision home page stub"],
    ["/revision/m1/units", "Revision doc page stub"],
  ])("renders the page for %s", async (path, expectedText) => {
    renderApp(path);

    expect(await screen.findByText(expectedText)).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("loading-progress")).toBeInTheDocument();
    expect(screen.getByTestId("update-prompt")).toBeInTheDocument();
    expect(sweepStaleActiveSessions).toHaveBeenCalledTimes(1);
  });

  it("renders the 404 page for unknown routes", async () => {
    renderApp("/does-not-exist");

    expect(await screen.findByText("404 page stub")).toBeInTheDocument();
  });

  it("hides the nav and makes the main surface session-sized on session routes", async () => {
    renderApp("/session/session-1");

    expect(await screen.findByText("Session page stub")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toHaveClass("nav-shell-hidden");
    expect(document.querySelector("#app-main")).toHaveClass("h-screen", "overflow-hidden");
  });

  it("scrolls to the top when the pathname changes", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <RouteChanger />
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Home page stub")).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Go practice" }));

    expect(await screen.findByText("Practice setup page stub")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    });
  });

  it("mirrors font, theme, and color settings onto the document dataset", async () => {
    renderApp("/");

    expect(await screen.findByText("Home page stub")).toBeInTheDocument();
    expect(document.documentElement.dataset.fontPreset).toBe("academic");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.colorTheme).toBeUndefined();

    act(() => {
      useSettingsStore.getState().update({
        fontPreset: "readable",
        theme: "light",
        colorTheme: "emerald",
      });
    });

    expect(document.documentElement.dataset.fontPreset).toBe("readable");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.colorTheme).toBe("emerald");

    act(() => {
      useSettingsStore.getState().update({
        theme: "dark",
        colorTheme: "amber",
      });
    });

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.colorTheme).toBeUndefined();
  });

  it("keeps interaction sounds disabled by default and follows the saved setting", async () => {
    renderApp("/");

    expect(await screen.findByText("Home page stub")).toBeInTheDocument();
    expect(interactionSoundMocks.installInteractionSounds).toHaveBeenCalledTimes(1);
    expect(interactionSoundMocks.setInteractionSoundsEnabled).toHaveBeenCalledWith(false);
    expect(interactionSoundMocks.setInteractionSoundVolume).toHaveBeenCalledWith(
      DEFAULT_SETTINGS.soundVolume,
    );

    act(() => {
      useSettingsStore.getState().update({ soundEffects: true, soundVolume: 160 });
    });

    expect(interactionSoundMocks.setInteractionSoundsEnabled).toHaveBeenLastCalledWith(true);
    expect(interactionSoundMocks.setInteractionSoundVolume).toHaveBeenLastCalledWith(160);
  });
});
