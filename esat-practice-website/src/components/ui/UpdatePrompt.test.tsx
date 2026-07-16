import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatePrompt } from "./UpdatePrompt";
import { useRegisterSW } from "virtual:pwa-register/react";
import { fetchRecentCommits } from "./recentCommits";

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: vi.fn(),
}));

vi.mock("./recentCommits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./recentCommits")>();
  return { ...actual, fetchRecentCommits: vi.fn() };
});

const setNeedRefresh = vi.fn();
const setOfflineReady = vi.fn();
const updateServiceWorker = vi.fn();
const registration = {
  update: vi.fn().mockResolvedValue(undefined),
} as unknown as ServiceWorkerRegistration;

function mockRegisterState({
  needRefresh = false,
  offlineReady = false,
}: {
  needRefresh?: boolean;
  offlineReady?: boolean;
} = {}) {
  vi.mocked(useRegisterSW).mockImplementation((options: any) => {
    options?.onRegisteredSW?.("/sw.js", registration);
    return {
      needRefresh: [needRefresh, setNeedRefresh],
      offlineReady: [offlineReady, setOfflineReady],
      updateServiceWorker,
    };
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setNeedRefresh.mockClear();
  setOfflineReady.mockClear();
  updateServiceWorker.mockClear();
  vi.mocked(registration.update).mockClear();
  mockRegisterState();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("UpdatePrompt", () => {
  it("renders nothing when no update or offline-ready state is active", () => {
    const { container } = render(<UpdatePrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the update message when a refresh is needed", () => {
    mockRegisterState({ needRefresh: true });

    render(<UpdatePrompt />);

    expect(screen.getByRole("status")).toHaveTextContent("Update available");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("renders the offline-ready message", () => {
    mockRegisterState({ offlineReady: true });

    render(<UpdatePrompt />);

    expect(screen.getByRole("status")).toHaveTextContent("Ready to work offline");
    expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  });

  it("dismisses both states", () => {
    mockRegisterState({ needRefresh: true });
    render(<UpdatePrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    expect(setOfflineReady).toHaveBeenCalledWith(false);
  });

  it("reloads through the service worker when requested", () => {
    mockRegisterState({ needRefresh: true });
    render(<UpdatePrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("fires the fallback reload timer after requesting an update", () => {
    const reload = vi.fn();
    mockRegisterState({ needRefresh: true });
    render(<UpdatePrompt reloadPage={reload} />);

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    vi.advanceTimersByTime(1499);
    expect(reload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses the offline-ready message", () => {
    mockRegisterState({ offlineReady: true });
    render(<UpdatePrompt />);

    vi.advanceTimersByTime(9999);
    expect(setOfflineReady).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(setOfflineReady).toHaveBeenCalledWith(false);
  });

  it("loads and shows recent commits when 'What's new' is expanded", async () => {
    vi.useRealTimers();
    vi.mocked(fetchRecentCommits).mockResolvedValue([
      {
        sha: "abc123",
        subject: "feat: shiny new thing",
        url: "https://github.com/x/y/commit/abc123",
        date: new Date().toISOString(),
      },
    ]);
    mockRegisterState({ needRefresh: true });
    render(<UpdatePrompt />);

    fireEvent.click(screen.getByRole("button", { name: /What.s new/ }));

    const link = await screen.findByRole("link", { name: "feat: shiny new thing" });
    expect(link).toHaveAttribute("href", "https://github.com/x/y/commit/abc123");
    expect(fetchRecentCommits).toHaveBeenCalledTimes(1);
  });

  it("shows an error note when the changelog fails to load", async () => {
    vi.useRealTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetchRecentCommits).mockRejectedValue(new Error("boom"));
    mockRegisterState({ needRefresh: true });
    render(<UpdatePrompt />);

    fireEvent.click(screen.getByRole("button", { name: /What.s new/ }));

    expect(await screen.findByText(/Couldn.t load the changelog/)).toBeInTheDocument();
  });

  it("checks the registration for updates on visibility changes and intervals", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    render(<UpdatePrompt />);

    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(60_000);

    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
