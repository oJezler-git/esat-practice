import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardShortcutOverlay } from "./KeyboardShortcutOverlay";

function pressKey(key: string, opts: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { key, ...opts });
}

describe("KeyboardShortcutOverlay — toggle", () => {
  it("is not visible on initial render", () => {
    render(<KeyboardShortcutOverlay />);
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("opens when '?' is pressed", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?");
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("toggles closed when '?' is pressed a second time", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?");
    pressKey("?");
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("closes when Escape is pressed while open", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?");
    pressKey("Escape");
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("does not open when Ctrl+? is pressed", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?", { ctrlKey: true });
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("does not open when Meta+? is pressed", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?", { metaKey: true });
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("does not open when Alt+? is pressed", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?", { altKey: true });
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });
});

describe("KeyboardShortcutOverlay — isTypingTarget guard", () => {
  it("does not open when '?' is dispatched from an input element", () => {
    render(
      <>
        <KeyboardShortcutOverlay />
        <input data-testid="text-input" />
      </>,
    );
    fireEvent.keyDown(screen.getByTestId("text-input"), { key: "?" });
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("does not open when '?' is dispatched from a textarea", () => {
    render(
      <>
        <KeyboardShortcutOverlay />
        <textarea data-testid="ta" />
      </>,
    );
    fireEvent.keyDown(screen.getByTestId("ta"), { key: "?" });
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("does not open when '?' is dispatched from a select", () => {
    render(
      <>
        <KeyboardShortcutOverlay />
        <select data-testid="sel">
          <option>A</option>
        </select>
      </>,
    );
    fireEvent.keyDown(screen.getByTestId("sel"), { key: "?" });
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("opens when '?' is dispatched from a non-typing element", () => {
    render(
      <>
        <KeyboardShortcutOverlay />
        <div data-testid="plain" />
      </>,
    );
    fireEvent.keyDown(screen.getByTestId("plain"), { key: "?" });
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });
});

describe("KeyboardShortcutOverlay — dismiss interactions", () => {
  it("closes when the backdrop overlay is clicked", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?");
    const backdrop = screen.getByText("Keyboard shortcuts").closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("stays open when the inner panel is clicked (stopPropagation)", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?");
    const heading = screen.getByText("Keyboard shortcuts");
    fireEvent.click(heading);
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("closes when the close button is clicked", () => {
    render(<KeyboardShortcutOverlay />);
    pressKey("?");
    fireEvent.click(screen.getByRole("button", { name: /close keyboard shortcut overlay/i }));
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });
});
