import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installInteractionSounds,
  previewInteractionSounds,
  setInteractionSoundVolume,
  setInteractionSoundsEnabled,
} from "./interactionSounds";

function dispatchPointerEvent(
  element: Element,
  type: string,
  options: { buttons?: number; pointerId?: number } = {},
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "buttons", { value: options.buttons ?? 0 });
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  element.dispatchEvent(event);
}

describe("interaction sounds", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete document.documentElement.dataset.soundEffects;
    delete document.documentElement.dataset.soundVolume;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete document.documentElement.dataset.soundEffects;
    delete document.documentElement.dataset.soundVolume;
  });

  it("mirrors the enabled and volume state into the document dataset", () => {
    setInteractionSoundsEnabled(true);
    setInteractionSoundVolume(175);

    expect(document.documentElement.dataset.soundEffects).toBe("on");
    expect(document.documentElement.dataset.soundVolume).toBe("175");

    setInteractionSoundsEnabled(false);

    expect(document.documentElement.dataset.soundEffects).toBeUndefined();
  });

  it("clamps the volume dataset for invalid values", () => {
    setInteractionSoundVolume(250);
    expect(document.documentElement.dataset.soundVolume).toBe("200");

    setInteractionSoundVolume(Number.NaN);
    expect(document.documentElement.dataset.soundVolume).toBe("125");
  });

  it("enables sounds when previewing newly enabled sounds", () => {
    previewInteractionSounds(150);

    expect(document.documentElement.dataset.soundEffects).toBe("on");
    expect(document.documentElement.dataset.soundVolume).toBe("150");
  });

  it("maps core interactions to distinct cues", () => {
    const playSound = vi.fn();
    const cleanup = installInteractionSounds(document, playSound);
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

    expect(playSound).toHaveBeenCalledWith("press");
    expect(playSound).toHaveBeenCalledWith("release");
    expect(playSound).toHaveBeenCalledWith("toggle");
    expect(playSound).toHaveBeenCalledWith("page");

    cleanup();
  });

  it("adds cues for sliders, typing, and drawing gestures", () => {
    const playSound = vi.fn();
    const cleanup = installInteractionSounds(document, playSound);
    const slider = document.createElement("input");
    const input = document.createElement("input");
    const drawingSurface = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    slider.type = "range";
    input.type = "text";
    drawingSurface.classList.add("drawing-svg");
    drawingSurface.dataset.tool = "pen";
    document.body.append(slider, input, drawingSurface);

    slider.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    dispatchPointerEvent(drawingSurface, "pointerdown", { buttons: 1, pointerId: 4 });
    dispatchPointerEvent(drawingSurface, "pointermove", { buttons: 1, pointerId: 4 });
    dispatchPointerEvent(drawingSurface, "pointerup", { pointerId: 4 });

    expect(playSound).toHaveBeenCalledWith("slider");
    expect(playSound).toHaveBeenCalledWith("typing");
    expect(playSound).toHaveBeenCalledWith("drawingStart");
    expect(playSound).toHaveBeenCalledWith("drawing");
    expect(playSound).toHaveBeenCalledWith("drawingEnd");

    cleanup();
  });

  it("does not layer generic press and release cues onto sliders", () => {
    const playSound = vi.fn();
    const cleanup = installInteractionSounds(document, playSound);
    const slider = document.createElement("input");

    slider.type = "range";
    document.body.append(slider);

    dispatchPointerEvent(slider, "pointerdown");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    dispatchPointerEvent(slider, "pointerup");

    expect(playSound).toHaveBeenCalledWith("slider");
    expect(playSound).not.toHaveBeenCalledWith("press");
    expect(playSound).not.toHaveBeenCalledWith("release");

    cleanup();
  });

  it("limits drawing bed cues to drawing-like tools and ends them on blur", () => {
    const playSound = vi.fn();
    const cleanup = installInteractionSounds(document, playSound);
    const drawingSurface = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    drawingSurface.classList.add("drawing-svg");
    drawingSurface.dataset.tool = "text";
    document.body.append(drawingSurface);

    dispatchPointerEvent(drawingSurface, "pointerdown", { buttons: 1, pointerId: 4 });

    expect(playSound).not.toHaveBeenCalledWith("drawingStart");

    drawingSurface.dataset.tool = "pen";
    dispatchPointerEvent(drawingSurface, "pointerdown", { buttons: 1, pointerId: 4 });
    window.dispatchEvent(new Event("blur"));
    dispatchPointerEvent(drawingSurface, "pointermove", { buttons: 1, pointerId: 4 });

    expect(playSound).toHaveBeenCalledWith("drawingStart");
    expect(playSound).toHaveBeenCalledWith("drawingEnd");
    expect(playSound).not.toHaveBeenCalledWith("drawing");

    cleanup();
  });

  it("stops handling interactions after cleanup", () => {
    const playSound = vi.fn();
    const cleanup = installInteractionSounds(document, playSound);
    const button = document.createElement("button");
    document.body.append(button);

    cleanup();
    dispatchPointerEvent(button, "pointerdown");

    expect(playSound).not.toHaveBeenCalled();
  });
});
