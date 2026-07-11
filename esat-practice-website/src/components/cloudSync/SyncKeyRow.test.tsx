import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncKeyRow } from "./SyncKeyRow";

const handlers = {
  onStartEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDraftChange: vi.fn(),
  onSaveEdit: vi.fn(),
  onStartChooseWords: vi.fn(),
  onCancelChooseWords: vi.fn(),
  onWord1Change: vi.fn(),
  onWord2Change: vi.fn(),
  onCreateWithWords: vi.fn(),
  onGenerate: vi.fn(),
  onCopy: vi.fn(),
  onDismissNew: vi.fn(),
};

const baseProps = {
  key_: "",
  editingKey: false,
  draftKey: "",
  choosingWords: false,
  word1: "",
  word2: "",
  wordError: "",
  creatingKey: false,
  newlyCreated: false,
  copying: false,
  ...handlers,
};

function renderRow(overrides: Partial<typeof baseProps> = {}) {
  return render(<SyncKeyRow {...baseProps} {...overrides} />);
}

describe("SyncKeyRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("without a key offers generate, choose-words, and enter-existing actions", () => {
    renderRow();

    fireEvent.click(screen.getByRole("button", { name: "Generate a sync key" }));
    expect(handlers.onGenerate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Choose your words" }));
    expect(handlers.onStartChooseWords).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Enter existing key" }));
    expect(handlers.onStartEdit).toHaveBeenCalledTimes(1);
  });

  it("with a key shows it, supports copy, and hides enter-existing", () => {
    renderRow({ key_: "amber-forest-4291" });

    expect(screen.getByText("amber-forest-4291")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate new key" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enter existing key" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(handlers.onCopy).toHaveBeenCalledTimes(1);

    // Clicking or keyboard-activating the key itself starts editing.
    fireEvent.click(screen.getByText("amber-forest-4291"));
    fireEvent.keyDown(screen.getByText("amber-forest-4291"), { key: "Enter" });
    fireEvent.keyDown(screen.getByText("amber-forest-4291"), { key: " " });
    expect(handlers.onStartEdit).toHaveBeenCalledTimes(3);
  });

  it("shows Copied! feedback while copying", () => {
    renderRow({ key_: "amber-forest-4291", copying: true });
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });

  it("edit mode wires input changes, Enter to save, and Escape to cancel", () => {
    renderRow({ editingKey: true, draftKey: "amber-fo" });

    const input = screen.getByRole("textbox", { name: "Sync key" });
    expect(input).toHaveValue("amber-fo");

    fireEvent.change(input, { target: { value: "amber-forest-4291" } });
    expect(handlers.onDraftChange).toHaveBeenCalledWith("amber-forest-4291");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onSaveEdit).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(handlers.onCancelEdit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(handlers.onSaveEdit).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handlers.onCancelEdit).toHaveBeenCalledTimes(2);
  });

  it("word picker validates emptiness via disabled state and wires all callbacks", () => {
    renderRow({ choosingWords: true, word1: "", word2: "" });

    // Create is disabled until both words are present.
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();

    const first = screen.getByRole("combobox", { name: "First word of sync key" });
    const second = screen.getByRole("combobox", { name: "Second word of sync key" });

    fireEvent.change(first, { target: { value: "amber" } });
    expect(handlers.onWord1Change).toHaveBeenCalledWith("amber");

    fireEvent.change(second, { target: { value: "forest" } });
    expect(handlers.onWord2Change).toHaveBeenCalledWith("forest");

    fireEvent.keyDown(second, { key: "Enter" });
    expect(handlers.onCreateWithWords).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(first, { key: "Escape" });
    fireEvent.keyDown(second, { key: "Escape" });
    expect(handlers.onCancelChooseWords).toHaveBeenCalledTimes(2);
  });

  it("word picker enables Create with both words and shows validation errors", () => {
    renderRow({
      choosingWords: true,
      word1: "amber",
      word2: "forest",
      wordError: "Letters only, please.",
    });

    const create = screen.getByRole("button", { name: "Create key" });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(handlers.onCreateWithWords).toHaveBeenCalledTimes(1);

    expect(screen.getByText("Letters only, please.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handlers.onCancelChooseWords).toHaveBeenCalledTimes(1);
  });

  it("shows Creating… and disables both buttons while the key is being created", () => {
    renderRow({ choosingWords: true, word1: "amber", word2: "forest", creatingKey: true });

    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("newly-created banner renders and can be dismissed", () => {
    renderRow({ key_: "amber-forest-4291", newlyCreated: true });

    expect(screen.getByText(/Key created/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(handlers.onDismissNew).toHaveBeenCalledTimes(1);
  });
});
