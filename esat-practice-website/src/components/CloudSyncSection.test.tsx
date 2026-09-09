import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudSyncSection } from "./CloudSyncSection";
import { getSyncKey, validateWordPair } from "../lib/cloudSync";
import { useSyncStatus } from "../lib/syncCoordinator";

vi.mock("../lib/cloudSync", () => ({
  getSyncKey: vi.fn(),
  validateWordPair: vi.fn(),
  ADJECTIVES: ["amber"],
  NOUNS: ["lake"],
}));
vi.mock("../lib/syncCoordinator", () => ({
  connectSyncKey: vi.fn().mockResolvedValue(undefined),
  createRandomSyncKey: vi.fn().mockResolvedValue("amber-lake-1234"),
  createSyncKeyWithWords: vi.fn().mockResolvedValue("amber-lake-4321"),
  disconnectSync: vi.fn().mockResolvedValue(undefined),
  syncNow: vi.fn().mockResolvedValue(undefined),
  useSyncStatus: vi.fn(),
}));

describe("CloudSyncSection", () => {
  beforeEach(() => {
    vi.mocked(getSyncKey).mockReturnValue(null);
    vi.mocked(validateWordPair).mockReturnValue({ valid: true });
    vi.mocked(useSyncStatus).mockReturnValue({ status: "disconnected", lastSyncedAt: null, error: null });
  });

  it("uses one-time setup and has no manual push or pull controls", () => {
    render(<CloudSyncSection />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Push" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pull" })).toBeNull();
    expect(screen.getByText(/save automatically/i)).toBeInTheDocument();
  });

  it("shows passive saved state and connection controls", () => {
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    vi.mocked(useSyncStatus).mockReturnValue({ status: "saved", lastSyncedAt: Date.now(), error: null });
    render(<CloudSyncSection />);
    expect(screen.getByText("amber-lake-1234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.getByText(/Saved just now/)).toBeInTheDocument();
  });

  it("shows validation errors in the word picker", () => {
    vi.mocked(validateWordPair).mockReturnValue({ valid: false, error: "Invalid word pair." });
    render(<CloudSyncSection />);
    fireEvent.click(screen.getByRole("button", { name: /Choose your words/ }));
    const inputs = screen.getAllByRole("combobox");
    fireEvent.change(inputs[0], { target: { value: "bad" } });
    fireEvent.change(inputs[1], { target: { value: "pair" } });
    fireEvent.click(screen.getByRole("button", { name: /Create key/ }));
    expect(screen.getByText("Invalid word pair.")).toBeInTheDocument();
  });

  it("shows offline and actionable error states without manual sync controls", () => {
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    vi.mocked(useSyncStatus).mockReturnValue({ status: "offline", lastSyncedAt: null, error: null });
    const { rerender } = render(<CloudSyncSection />);
    expect(screen.getByText("Offline — changes will sync automatically")).toBeInTheDocument();

    vi.mocked(useSyncStatus).mockReturnValue({ status: "error", lastSyncedAt: null, error: "Server unavailable" });
    rerender(<CloudSyncSection />);
    expect(screen.getByText("Sync needs attention")).toBeInTheDocument();
    expect(screen.getByText("Server unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Push" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pull" })).toBeNull();
  });
});
