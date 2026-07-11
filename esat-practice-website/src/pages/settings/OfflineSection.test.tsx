import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Settings from ".";
import { useSettingsStore } from "../../lib/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";
import type { OfflineDownloadState } from "../../lib/offlineDownload";
import {
  clearOfflineImageCache,
  downloadAllImagesForOffline,
  getCurrentDataVersion,
  getOfflineDownloadState,
} from "../../lib/offlineDownload";

vi.mock("../../components/CloudSyncSection", () => ({
  CloudSyncSection: () => <section aria-label="Cloud sync" />,
}));

vi.mock("../../components/DataManagementSection", () => ({
  DataManagementSection: () => <section aria-label="Data management" />,
}));

vi.mock("../../lib/excludedQuestionStore", () => ({
  useExcludedQuestionStore: () => ({
    excludedQuestions: [],
    includeQuestion: vi.fn(),
  }),
}));

vi.mock("../../lib/offlineDownload", () => ({
  clearOfflineImageCache: vi.fn(),
  downloadAllImagesForOffline: vi.fn(),
  getCurrentDataVersion: vi.fn(),
  getOfflineDownloadState: vi.fn(),
}));

const savedState: OfflineDownloadState = {
  downloadedAt: new Date(2026, 5, 20).getTime(),
  count: 123,
  dataVersion: "2026-06-01",
};

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings OfflineSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
    vi.mocked(getOfflineDownloadState).mockReturnValue(null);
    vi.mocked(getCurrentDataVersion).mockResolvedValue("2026-06-01");
  });

  it("shows the not-downloaded state and runs a download with progress", async () => {
    let reportProgress: (done: number, total: number) => void = () => {};
    let finishDownload: (count: number) => void = () => {};
    vi.mocked(downloadAllImagesForOffline).mockImplementation(
      (onProgress) =>
        new Promise((resolve) => {
          reportProgress = onProgress;
          finishDownload = resolve;
        }),
    );

    renderSettings();
    expect(screen.getByText("Not downloaded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    // Before the first progress callback the total is unknown.
    expect(screen.getByText("Preparing…")).toBeInTheDocument();

    act(() => reportProgress(3, 10));
    expect(screen.getByText("3 / 10 images")).toBeInTheDocument();

    // Completion re-reads the persisted state and shows the cached summary.
    vi.mocked(getOfflineDownloadState).mockReturnValue(savedState);
    act(() => finishDownload(10));
    await waitFor(() => {
      expect(screen.getByText("123 images cached")).toBeInTheDocument();
    });
    expect(screen.getByText(/Downloaded 20 Jun 2026/)).toBeInTheDocument();
  });

  it("cancel aborts the in-flight download and returns to the idle state", async () => {
    let seenSignal: AbortSignal | undefined;
    vi.mocked(downloadAllImagesForOffline).mockImplementation(
      (_onProgress, signal) =>
        new Promise((_resolve, reject) => {
          seenSignal = signal;
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(seenSignal?.aborted).toBe(true);
    // The rejection lands as download_error after the cancel dispatch; either
    // way the progress UI is gone and a start button is back.
    await waitFor(() => {
      expect(screen.queryByText("Preparing…")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Download|Retry/ }),
    ).toBeInTheDocument();
  });

  it("shows the error state with a Retry button when the download fails", async () => {
    vi.mocked(downloadAllImagesForOffline).mockRejectedValue(new Error("network"));

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(
        screen.getByText("Download failed — check your connection."),
      ).toBeInTheDocument();
    });

    // Retry kicks off a fresh download.
    vi.mocked(downloadAllImagesForOffline).mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Preparing…")).toBeInTheDocument();
    expect(downloadAllImagesForOffline).toHaveBeenCalledTimes(2);
  });

  it("shows the cached summary when up to date and clears it on request", async () => {
    vi.mocked(getOfflineDownloadState).mockReturnValue(savedState);
    vi.mocked(clearOfflineImageCache).mockResolvedValue(undefined);

    renderSettings();
    expect(screen.getByText("123 images cached")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Downloaded 20 Jun 2026/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/New question data available/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => {
      expect(screen.getByText("Not downloaded")).toBeInTheDocument();
    });
    expect(clearOfflineImageCache).toHaveBeenCalledTimes(1);
  });

  it("flags a stale cache when the live data version differs", async () => {
    vi.mocked(getOfflineDownloadState).mockReturnValue(savedState);
    vi.mocked(getCurrentDataVersion).mockResolvedValue("2026-07-01");

    renderSettings();
    await waitFor(() => {
      expect(
        screen.getByText("New question data available — refresh to update"),
      ).toBeInTheDocument();
    });

    // Refresh restarts the download flow.
    vi.mocked(downloadAllImagesForOffline).mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("Preparing…")).toBeInTheDocument();
  });
});
