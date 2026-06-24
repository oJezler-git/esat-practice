import { describe, it, expect } from "vitest";
import { normalizeShortcutKey, formatShortcutKey } from "./settings";

describe("normalizeShortcutKey", () => {
  it("returns null for an empty string", () => {
    expect(normalizeShortcutKey("")).toBeNull();
  });

  it('normalises " " to "Space"', () => {
    expect(normalizeShortcutKey(" ")).toBe("Space");
  });

  it('normalises "Spacebar" to "Space"', () => {
    expect(normalizeShortcutKey("Spacebar")).toBe("Space");
  });

  it("lowercases single-character keys", () => {
    expect(normalizeShortcutKey("A")).toBe("a");
    expect(normalizeShortcutKey("N")).toBe("n");
    expect(normalizeShortcutKey("F")).toBe("f");
  });

  it("passes a single lowercase character through unchanged", () => {
    expect(normalizeShortcutKey("x")).toBe("x");
  });

  it("passes through all allowed named keys", () => {
    const allowed = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape", "Tab", "Backspace"];
    for (const key of allowed) {
      expect(normalizeShortcutKey(key)).toBe(key);
    }
  });

  it("returns null for unrecognised named keys", () => {
    expect(normalizeShortcutKey("Home")).toBeNull();
    expect(normalizeShortcutKey("PageUp")).toBeNull();
    expect(normalizeShortcutKey("Control")).toBeNull();
    expect(normalizeShortcutKey("Shift")).toBeNull();
  });
});

describe("formatShortcutKey", () => {
  it('formats "Space" as "Space"', () => {
    expect(formatShortcutKey("Space")).toBe("Space");
  });

  it("formats arrow keys as short direction labels", () => {
    expect(formatShortcutKey("ArrowLeft")).toBe("Left");
    expect(formatShortcutKey("ArrowRight")).toBe("Right");
    expect(formatShortcutKey("ArrowUp")).toBe("Up");
    expect(formatShortcutKey("ArrowDown")).toBe("Down");
  });

  it("uppercases single-character keys", () => {
    expect(formatShortcutKey("n")).toBe("N");
    expect(formatShortcutKey("f")).toBe("F");
    expect(formatShortcutKey("s")).toBe("S");
  });

  it("returns other named keys as-is", () => {
    expect(formatShortcutKey("Enter")).toBe("Enter");
    expect(formatShortcutKey("Escape")).toBe("Escape");
    expect(formatShortcutKey("Tab")).toBe("Tab");
    expect(formatShortcutKey("Backspace")).toBe("Backspace");
  });
});
