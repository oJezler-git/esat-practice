import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudSync } from "./useCloudSync";
import { getSyncKey, validateWordPair } from "../../lib/cloudSync";
import {
  connectSyncKey,
  createRandomSyncKey,
  createSyncKeyWithWords,
  disconnectSync,
  syncNow,
  useSyncStatus,
} from "../../lib/syncCoordinator";

vi.mock("../../lib/cloudSync", () => ({
  getSyncKey: vi.fn(),
  validateWordPair: vi.fn(),
}));

vi.mock("../../lib/syncCoordinator", () => ({
  connectSyncKey: vi.fn(),
  createRandomSyncKey: vi.fn(),
  createSyncKeyWithWords: vi.fn(),
  disconnectSync: vi.fn(),
  syncNow: vi.fn(),
  useSyncStatus: vi.fn(),
}));

let latest: ReturnType<typeof useCloudSync> | undefined;

function Harness() {
  latest = useCloudSync();
  return (
    <div>
      <output data-testid="key">{latest.state.key}</output>
      <output data-testid="editing">{String(latest.state.editingKey)}</output>
      <output data-testid="new">{String(latest.state.newlyCreated)}</output>
      <output data-testid="copying">{String(latest.state.copying)}</output>
      <output data-testid="status">{latest.syncStatus.status}:{latest.syncStatus.error ?? ""}</output>
      <button onClick={latest.onGenerate}>generate</button>
      <button onClick={latest.onStartEdit}>edit</button>
      <button onClick={() => latest?.onDraftChange(" blue-hill-5678 ")}>draft</button>
      <button onClick={() => void latest?.onSaveEdit()}>save</button>
      <button onClick={latest.onStartChooseWords}>choose</button>
      <button onClick={() => latest?.onWord1Change("Amber!")}>word1</button>
      <button onClick={() => latest?.onWord2Change("Lake2")}>word2</button>
      <button onClick={() => void latest?.onCreateWithWords()}>create</button>
      <button onClick={() => void latest?.onCopy()}>copy</button>
      <button onClick={() => void latest?.onDisconnect()}>disconnect</button>
      <button onClick={() => void latest?.onRetry()}>retry</button>
    </div>
  );
}

describe("useCloudSync automatic connection controls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getSyncKey).mockReturnValue("amber-lake-1234");
    vi.mocked(validateWordPair).mockReturnValue({ valid: true });
    vi.mocked(useSyncStatus).mockReturnValue({ status: "saved", lastSyncedAt: 123, error: null });
    vi.mocked(connectSyncKey).mockResolvedValue(undefined);
    vi.mocked(createRandomSyncKey).mockResolvedValue("blue-hill-5678");
    vi.mocked(createSyncKeyWithWords).mockResolvedValue("amber-lake-4321");
    vi.mocked(disconnectSync).mockResolvedValue(undefined);
    vi.mocked(syncNow).mockResolvedValue(undefined);
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

  it("guards replacement and allocates random keys on the server", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<Harness />);
    await act(async () => screen.getByRole("button", { name: "generate" }).click());
    expect(createRandomSyncKey).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValue(true);
    await act(async () => screen.getByRole("button", { name: "generate" }).click());
    expect(createRandomSyncKey).toHaveBeenCalledOnce();
    expect(screen.getByTestId("key")).toHaveTextContent("blue-hill-5678");
  });

  it("connects an edited existing key immediately", async () => {
    render(<Harness />);
    act(() => screen.getByRole("button", { name: "edit" }).click());
    act(() => screen.getByRole("button", { name: "draft" }).click());
    await act(async () => screen.getByRole("button", { name: "save" }).click());
    expect(connectSyncKey).toHaveBeenCalledWith("blue-hill-5678");
    expect(screen.getByTestId("editing")).toHaveTextContent("false");
  });

  it("creates a memorable key and dismisses the reminder", async () => {
    render(<Harness />);
    act(() => screen.getByRole("button", { name: "choose" }).click());
    act(() => screen.getByRole("button", { name: "word1" }).click());
    act(() => screen.getByRole("button", { name: "word2" }).click());
    await act(async () => screen.getByRole("button", { name: "create" }).click());
    expect(createSyncKeyWithWords).toHaveBeenCalledWith("amber-lake");
    expect(screen.getByTestId("new")).toHaveTextContent("true");
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByTestId("new")).toHaveTextContent("false");
  });

  it("copies, disconnects with confirmation, and retries", async () => {
    render(<Harness />);
    await act(async () => screen.getByRole("button", { name: "copy" }).click());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("amber-lake-1234");
    expect(screen.getByTestId("copying")).toHaveTextContent("true");
    await act(async () => screen.getByRole("button", { name: "disconnect" }).click());
    expect(disconnectSync).toHaveBeenCalledOnce();
    expect(screen.getByTestId("key")).toHaveTextContent("");
    await act(async () => screen.getByRole("button", { name: "retry" }).click());
    expect(syncNow).toHaveBeenCalledWith("manual");
  });

  it("clears a local action error before retrying automatic sync", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    render(<Harness />);

    await act(async () => screen.getByRole("button", { name: "copy" }).click());
    expect(screen.getByTestId("status")).toHaveTextContent("error:Clipboard access denied");

    await act(async () => screen.getByRole("button", { name: "retry" }).click());
    expect(screen.getByTestId("status")).toHaveTextContent("saved:");
    expect(syncNow).toHaveBeenCalledWith("manual");
  });
});
