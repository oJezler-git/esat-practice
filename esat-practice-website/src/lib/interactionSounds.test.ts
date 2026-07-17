import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installInteractionSounds,
  previewInteractionSounds,
  setInteractionSoundsEnabled,
} from "./interactionSounds";

const cuelume = vi.hoisted(() => ({
  play: vi.fn(),
  setEnabled: vi.fn(),
  sounds: [
    "chime",
    "sparkle",
    "droplet",
    "bloom",
    "whisper",
    "tick",
    "press",
    "release",
    "toggle",
    "success",
    "error",
    "page",
    "loading",
    "ready",
  ],
}));

vi.mock("cuelume", () => cuelume);

function dispatchPointerEvent(element: Element, type: string) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  element.dispatchEvent(event);
}

describe("interaction sounds", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete document.documentElement.dataset.soundEffects;
    cuelume.play.mockClear();
    cuelume.setEnabled.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete document.documentElement.dataset.soundEffects;
  });

  it("mirrors the enabled state into Cuelume and the document dataset", () => {
    setInteractionSoundsEnabled(true);

    expect(cuelume.setEnabled).toHaveBeenCalledWith(true);
    expect(document.documentElement.dataset.soundEffects).toBe("on");

    setInteractionSoundsEnabled(false);

    expect(cuelume.setEnabled).toHaveBeenCalledWith(false);
    expect(document.documentElement.dataset.soundEffects).toBeUndefined();
  });

  it("plays a ready cue when previewing newly enabled sounds", () => {
    previewInteractionSounds();

    expect(cuelume.setEnabled).toHaveBeenCalledWith(true);
    expect(cuelume.play).toHaveBeenCalledWith("ready");
  });

  it("maps core interactions to distinct Cuelume cues", () => {
    const cleanup = installInteractionSounds();
    const button = document.createElement("button");
    const switchButton = document.createElement("button");
    const link = document.createElement("a");

    switchButton.setAttribute("role", "switch");
    link.href = "/practice";
    link.addEventListener("click", (event) => event.preventDefault());

    document.body.append(button, switchButton, link);

    dispatchPointerEvent(button, "pointerdown");
    dispatchPointerEvent(button, "pointerup");
    switchButton.click();
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(cuelume.play).toHaveBeenCalledWith("press");
    expect(cuelume.play).toHaveBeenCalledWith("release");
    expect(cuelume.play).toHaveBeenCalledWith("toggle");
    expect(cuelume.play).toHaveBeenCalledWith("page");

    cleanup();
  });

  it("stops handling interactions after cleanup", () => {
    const cleanup = installInteractionSounds();
    const button = document.createElement("button");
    document.body.append(button);

    cleanup();
    dispatchPointerEvent(button, "pointerdown");

    expect(cuelume.play).not.toHaveBeenCalled();
  });
});
