import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCopy } from "./useCopy";

function CopyHarness({ getText }: { getText: () => string | Promise<string> }) {
  const { copied, copy } = useCopy(getText);
  return (
    <button type="button" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function setClipboard(writeText: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

function setExecCommand(returnValue: boolean) {
  const execCommand = vi.fn().mockReturnValue(returnValue);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
  return execCommand;
}

describe("useCopy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setClipboard(undefined);
    delete (document as Partial<Document>).execCommand;
  });

  it("copies through navigator.clipboard.writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    render(<CopyHarness getText={() => "page text"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await screen.findByRole("button", { name: "Copied" });
    expect(writeText).toHaveBeenCalledWith("page text");
  });

  it("falls back when clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    setClipboard(writeText);
    const execCommand = setExecCommand(true);

    render(<CopyHarness getText={() => "fallback text"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await screen.findByRole("button", { name: "Copied" });
    expect(writeText).toHaveBeenCalledWith("fallback text");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("uses document.execCommand when the clipboard API is unavailable", async () => {
    setClipboard(undefined);
    const execCommand = setExecCommand(true);

    render(<CopyHarness getText={() => "legacy text"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await screen.findByRole("button", { name: "Copied" });
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("supports an async text provider", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    render(<CopyHarness getText={async () => "async text"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await screen.findByRole("button", { name: "Copied" });
    expect(writeText).toHaveBeenCalledWith("async text");
  });

  it("resets copied state after the timer", async () => {
    vi.useFakeTimers();
    setClipboard(vi.fn().mockResolvedValue(undefined));

    render(<CopyHarness getText={() => "page text"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("cleans up the copied-state timer on unmount", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    setClipboard(vi.fn().mockResolvedValue(undefined));

    const { unmount } = render(<CopyHarness getText={() => "page text"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
