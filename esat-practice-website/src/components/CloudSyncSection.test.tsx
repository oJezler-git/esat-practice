import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { CloudSyncSection } from "./CloudSyncSection";

vi.mock("../lib/cloudSync", () => ({
  getSyncKey: vi.fn().mockReturnValue(null),
  getLastPush: vi.fn().mockReturnValue(null),
  getLastPull: vi.fn().mockReturnValue(null),
  generateSyncKey: vi.fn().mockReturnValue("amber-lake-1234"),
  setSyncKey: vi.fn(),
  pushToCloud: vi.fn().mockResolvedValue(undefined),
  pullFromCloud: vi.fn().mockResolvedValue(undefined),
  restoreLastBackup: vi.fn().mockResolvedValue(undefined),
  hasLocalBackup: vi.fn().mockResolvedValue(false),
  createSyncKeyWithWords: vi.fn().mockResolvedValue("amber-lake-4321"),
  validateWordPair: vi.fn().mockReturnValue({ valid: true }),
  ADJECTIVES: ["amber", "blue"],
  NOUNS: ["lake", "hill"],
  SYNC_KEY_STORAGE_KEY: "esat-sync-key",
}));

import {
  getSyncKey,
  getLastPush,
  pushToCloud,
  pullFromCloud,
  validateWordPair,
} from "../lib/cloudSync";

beforeEach(() => {
  vi.mocked(getSyncKey).mockReturnValue(null);
  vi.mocked(getLastPush).mockReturnValue(null);
  vi.mocked(pushToCloud).mockResolvedValue(undefined);
  vi.mocked(pullFromCloud).mockResolvedValue(undefined);
  vi.mocked(validateWordPair).mockReturnValue({ valid: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// CloudSyncSection's hook checks hasLocalBackup() in a mount effect; flush
// that resolved promise inside act() so its state update doesn't land after
// the test has already exited (which logs a spurious "not wrapped in act").
async function renderSection() {
  const utils = render(<CloudSyncSection />);
  await act(async () => {});
  return utils;
}

describe("CloudSyncSection — last push display", () => {
  it("shows 'Never pushed' when there is no last push timestamp", async () => {
    vi.mocked(getLastPush).mockReturnValue(null);
    await renderSection();
    expect(screen.getByText("Never pushed")).toBeInTheDocument();
  });

  it("shows 'just now' for a push within the last minute", async () => {
    vi.useFakeTimers();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    vi.mocked(getLastPush).mockReturnValue(now - 30_000);

    await renderSection();
    expect(screen.getByText(/Last pushed just now/)).toBeInTheDocument();
  });

  it("shows minute count for pushes between 1 and 59 minutes ago", async () => {
    vi.useFakeTimers();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    vi.mocked(getLastPush).mockReturnValue(now - 2 * 60_000);

    await renderSection();
    expect(screen.getByText(/Last pushed 2 minutes ago/)).toBeInTheDocument();
  });

  it("uses singular 'minute' for exactly 1 minute ago", async () => {
    vi.useFakeTimers();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    vi.mocked(getLastPush).mockReturnValue(now - 60_001);

    await renderSection();
    expect(screen.getByText(/1 minute ago/)).toBeInTheDocument();
  });

  it("shows hour count for pushes 1–23 hours ago", async () => {
    vi.useFakeTimers();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    vi.mocked(getLastPush).mockReturnValue(now - 3 * 60 * 60_000);

    await renderSection();
    expect(screen.getByText(/Last pushed 3 hours ago/)).toBeInTheDocument();
  });

  it("shows day count for pushes 24+ hours ago", async () => {
    vi.useFakeTimers();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    vi.mocked(getLastPush).mockReturnValue(now - 2 * 24 * 60 * 60_000);

    await renderSection();
    expect(screen.getByText(/Last pushed 2 days ago/)).toBeInTheDocument();
  });
});

describe("CloudSyncSection — push/pull button state", () => {
  it("disables push and pull buttons when there is no key", async () => {
    vi.mocked(getSyncKey).mockReturnValue(null);
    await renderSection();

    expect(screen.getByRole("button", { name: /^Push$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Pull$/ })).toBeDisabled();
  });

  it("enables push and pull buttons when a key is set", async () => {
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    await renderSection();

    expect(screen.getByRole("button", { name: /^Push$/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^Pull$/ })).not.toBeDisabled();
  });

  it("shows success status after a successful push", async () => {
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    await renderSection();

    fireEvent.click(screen.getByRole("button", { name: /^Push$/ }));

    await waitFor(() => {
      expect(screen.getByText("Data pushed to cloud.")).toBeInTheDocument();
    });
  });

  it("shows error status when push fails", async () => {
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    vi.mocked(pushToCloud).mockRejectedValue(new Error("Server error"));
    await renderSection();

    fireEvent.click(screen.getByRole("button", { name: /^Push$/ }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });
});

describe("CloudSyncSection — key display", () => {
  it("renders the key as code when one is set", async () => {
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    await renderSection();
    expect(screen.getByText("amber-lake-1234")).toBeInTheDocument();
  });

  it("shows Copy button when a key is set", async () => {
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    await renderSection();
    expect(screen.getByRole("button", { name: /Copy/ })).toBeInTheDocument();
  });
});

describe("CloudSyncSection — word picker validation", () => {
  it("shows word error when validateWordPair returns invalid", async () => {
    vi.mocked(getSyncKey).mockReturnValue(null);
    vi.mocked(validateWordPair).mockReturnValue({ valid: false, error: "Invalid word pair." });
    await renderSection();

    fireEvent.click(screen.getByRole("button", { name: /Choose your words/ }));

    const [word1Input, word2Input] = screen.getAllByRole("combobox");
    fireEvent.change(word1Input, { target: { value: "badword" } });
    fireEvent.change(word2Input, { target: { value: "?" } });
    fireEvent.click(screen.getByRole("button", { name: /Create key/ }));

    await waitFor(() => {
      expect(screen.getByText("Invalid word pair.")).toBeInTheDocument();
    });
  });
});

describe("CloudSyncSection — status auto-clear", () => {
  it("clears the status banner after 5 seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    await renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Push$/ }));
    });

    expect(screen.getByText("Data pushed to cloud.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5001);
    });

    expect(screen.queryByText("Data pushed to cloud.")).toBeNull();
  });
});
