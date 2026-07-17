import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudSync } from "./useCloudSync";
import type { SyncStatus } from "./useCloudSync";
import {
  createSyncKeyWithWords,
  generateSyncKey,
  getLastPull,
  getLastPush,
  getSyncKey,
  hasLocalBackup,
  pullFromCloud,
  pushToCloud,
  restoreLastBackup,
  setSyncKey,
  validateWordPair,
} from "../../lib/cloudSync";

vi.mock("../../lib/cloudSync", () => ({
  getSyncKey: vi.fn(),
  getLastPush: vi.fn(),
  getLastPull: vi.fn(),
  hasLocalBackup: vi.fn(),
  generateSyncKey: vi.fn(),
  setSyncKey: vi.fn(),
  createSyncKeyWithWords: vi.fn(),
  validateWordPair: vi.fn(),
  pushToCloud: vi.fn(),
  pullFromCloud: vi.fn(),
  restoreLastBackup: vi.fn(),
}));

let latest: ReturnType<typeof useCloudSync> | undefined;

function Harness() {
  latest = useCloudSync();
  const status: SyncStatus = latest.state.status;
  return (
    <div>
      <output data-testid="key">{latest.state.key}</output>
      <output data-testid="draft">{latest.state.draftKey}</output>
      <output data-testid="editing">{String(latest.state.editingKey)}</output>
      <output data-testid="choosing">{String(latest.state.choosingWords)}</output>
      <output data-testid="new">{String(latest.state.newlyCreated)}</output>
      <output data-testid="copying">{String(latest.state.copying)}</output>
      <output data-testid="undo">{String(latest.showUndo)}</output>
      <output data-testid="last-pull">{String(latest.state.lastPull)}</output>
      <output data-testid="backup">{String(latest.state.hasBackup)}</output>
      <output data-testid="status">{status ? `${status.type}:${status.text}` : "none"}</output>
      <button type="button" onClick={latest.onGenerate}>generate</button>
      <button type="button" onClick={latest.onStartEdit}>edit</button>
      <button type="button" onClick={() => latest?.onDraftChange(" edited-key ")}>draft</button>
      <button type="button" onClick={latest.onSaveEdit}>save</button>
      <button type="button" onClick={latest.onCancelEdit}>cancel</button>
      <button type="button" onClick={latest.onStartChooseWords}>choose</button>
      <button type="button" onClick={() => latest?.onWord1Change("Amber!")}>word1</button>
      <button type="button" onClick={() => latest?.onWord2Change("Lake2")}>word2</button>
      <button type="button" onClick={() => { void latest?.onCreateWithWords(); }}>create</button>
      <button type="button" onClick={() => { void latest?.onCopy(); }}>copy</button>
      <button type="button" onClick={() => { void latest?.onPull(); }}>pull</button>
      <button type="button" onClick={() => { void latest?.onRestore(); }}>restore</button>
    </div>
  );
}

describe("useCloudSync", () => {
  beforeEach(() => {
    latest = undefined;
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    vi.mocked(getLastPush).mockReturnValue(null);
    vi.mocked(getLastPull).mockReturnValue(null);
    vi.mocked(hasLocalBackup).mockResolvedValue(false);
    vi.mocked(generateSyncKey).mockReturnValue("blue-hill-5678");
    vi.mocked(createSyncKeyWithWords).mockResolvedValue("amber-lake-4321");
    vi.mocked(validateWordPair).mockReturnValue({ valid: true });
    vi.mocked(pullFromCloud).mockResolvedValue(undefined);
    vi.mocked(pushToCloud).mockResolvedValue(undefined);
    vi.mocked(restoreLastBackup).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("guards key replacement behind confirmation", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<Harness />);
    await act(async () => {});

    act(() => {
      screen.getByRole("button", { name: "generate" }).click();
    });

    expect(generateSyncKey).not.toHaveBeenCalled();
    expect(screen.getByTestId("key")).toHaveTextContent("amber-lake-1234");
  });

  it("edits, saves, and cancels sync keys", async () => {
    render(<Harness />);
    await act(async () => {});

    act(() => {
      screen.getByRole("button", { name: "edit" }).click();
    });
    expect(screen.getByTestId("editing")).toHaveTextContent("true");
    expect(screen.getByTestId("draft")).toHaveTextContent("amber-lake-1234");

    act(() => {
      screen.getByRole("button", { name: "draft" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "save" }).click();
    });

    expect(setSyncKey).toHaveBeenCalledWith("edited-key");
    expect(screen.getByTestId("key")).toHaveTextContent("edited-key");
    expect(screen.getByTestId("editing")).toHaveTextContent("false");

    act(() => {
      screen.getByRole("button", { name: "edit" }).click();
      screen.getByRole("button", { name: "cancel" }).click();
    });
    expect(screen.getByTestId("editing")).toHaveTextContent("false");
  });

  it("creates a word-based key, shows the replacement warning, then dismisses it on timer", async () => {
    render(<Harness />);

    await act(async () => {
      screen.getByRole("button", { name: "choose" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "word1" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "word2" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "create" }).click();
    });

    expect(window.confirm).toHaveBeenCalledWith("This will replace your current sync key. Continue?");
    expect(createSyncKeyWithWords).toHaveBeenCalledWith("amber-lake");
    expect(screen.getByTestId("key")).toHaveTextContent("amber-lake-4321");
    expect(screen.getByTestId("new")).toHaveTextContent("true");

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(screen.getByTestId("new")).toHaveTextContent("false");
  });

  it("handles clipboard success and failure", async () => {
    render(<Harness />);

    await act(async () => {
      screen.getByRole("button", { name: "copy" }).click();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("amber-lake-1234");
    expect(screen.getByTestId("copying")).toHaveTextContent("true");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId("copying")).toHaveTextContent("false");

    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("nope"));
    await act(async () => {
      screen.getByRole("button", { name: "copy" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("Clipboard access denied");
  });

  it("schedules reload after pull and exposes the undo window", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    vi.mocked(hasLocalBackup).mockResolvedValue(true);
    render(<Harness />);
    await act(async () => {});
    expect(screen.getByTestId("backup")).toHaveTextContent("true");

    await act(async () => {
      screen.getByRole("button", { name: "pull" }).click();
    });

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Pull data from cloud"));
    expect(pullFromCloud).toHaveBeenCalledWith("amber-lake-1234");
    expect(screen.getByTestId("undo")).toHaveTextContent("true");
    expect(screen.getByTestId("status")).toHaveTextContent("Cloud data merged");
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1200);
  });

  it("restores from backup and clears the undo window", async () => {
    vi.mocked(getLastPull).mockReturnValue(1_700_000_000_000 - 60_000);
    vi.mocked(hasLocalBackup).mockResolvedValue(true);
    render(<Harness />);
    await act(async () => {});
    expect(screen.getByTestId("undo")).toHaveTextContent("true");

    await act(async () => {
      screen.getByRole("button", { name: "restore" }).click();
    });

    expect(restoreLastBackup).toHaveBeenCalled();
    expect(screen.getByTestId("undo")).toHaveTextContent("false");
    expect(screen.getByTestId("last-pull")).toHaveTextContent("null");
    expect(screen.getByTestId("status")).toHaveTextContent("Restored. Reloading");
  });

  it("cleans up pending timers on unmount", async () => {
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = render(<Harness />);

    await act(async () => {
      screen.getByRole("button", { name: "pull" }).click();
      screen.getByRole("button", { name: "copy" }).click();
    });

    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });
});
