import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AskClaudeInfoModal } from "./AskClaudeInfoModal";
import { useSettingsStore } from "../lib/settingsStore";
import { DEFAULT_SETTINGS } from "../types/settings";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function installDialogMocks() {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {},
    });
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {},
    });
  }

  const showModal = vi
    .spyOn(HTMLDialogElement.prototype, "showModal")
    .mockImplementation(function showModalMock(this: HTMLDialogElement) {
      Object.defineProperty(this, "open", {
        configurable: true,
        value: true,
      });
      this.setAttribute("open", "");
    });

  const close = vi
    .spyOn(HTMLDialogElement.prototype, "close")
    .mockImplementation(function closeMock(this: HTMLDialogElement) {
      Object.defineProperty(this, "open", {
        configurable: true,
        value: false,
      });
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    });

  return { showModal, close };
}

describe("AskClaudeInfoModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, claudeOnboarded: false } });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens with showModal and closes the native dialog during cleanup", () => {
    const { showModal, close } = installDialogMocks();

    const view = render(
      <MemoryRouter>
        <AskClaudeInfoModal onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog", { name: "Ask Claude" })).toBeInTheDocument();
    expect(showModal).toHaveBeenCalledOnce();

    view.unmount();

    expect(close).toHaveBeenCalledOnce();
  });

  it("marks the Ask Claude onboarding as seen", () => {
    installDialogMocks();

    render(
      <MemoryRouter>
        <AskClaudeInfoModal onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(useSettingsStore.getState().settings.claudeOnboarded).toBe(true);
  });

  it("closes from the close button and propagates onClose", () => {
    installDialogMocks();
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <AskClaudeInfoModal onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes from the backdrop", () => {
    installDialogMocks();
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <AskClaudeInfoModal onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("dialog", { name: "Ask Claude" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens the install script in a new window", () => {
    installDialogMocks();
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <MemoryRouter>
        <AskClaudeInfoModal onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /install script/i }));

    expect(open).toHaveBeenCalledWith("/esat-claude-helper.user.js", "_blank", "noopener");
  });

  it("closes and navigates to settings from the preference link", async () => {
    installDialogMocks();
    const onClose = vi.fn();

    render(
      <MemoryRouter initialEntries={["/session/session-1"]}>
        <Routes>
          <Route
            path="/session/:id"
            element={
              <>
                <AskClaudeInfoModal onClose={onClose} />
                <LocationProbe />
              </>
            }
          />
          <Route path="/settings" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /change your integration preference in settings/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/settings");
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
