import { play, setEnabled, sounds, type SoundName } from "cuelume";

const SOUND_NAMES = new Set<SoundName>(sounds);
const HOVER_THROTTLE_MS = 150;

const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input:not([type='hidden'])",
  "select",
  "summary",
  "[role='button']",
  "[role='switch']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[role='radio']",
].join(",");

const TOGGLE_SELECTOR = [
  "input[type='checkbox']",
  "input[type='radio']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[aria-pressed]",
  "[aria-checked]",
].join(",");

const NAVIGATION_SELECTOR = "a[href], .nav-link, .mobile-nav-link";
const TEXT_INPUT_SELECTOR =
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']), textarea";
const DISABLED_SELECTOR = ":disabled, [aria-disabled='true']";
const IGNORE_SELECTOR = "[data-sound='off'], [data-cuelume-ignore]";

type SoundRoot = Document | HTMLElement;

function isSoundName(value: string | undefined): value is SoundName {
  return value !== undefined && SOUND_NAMES.has(value as SoundName);
}

function cueFor(element: HTMLElement, fallback: SoundName): SoundName {
  const override = element.dataset.sound;
  return isSoundName(override) ? override : fallback;
}

function findInteractive(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const element = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
  if (!element || element.matches(DISABLED_SELECTOR) || element.closest(IGNORE_SELECTOR)) {
    return null;
  }

  return element;
}

function isFinePointer(event: PointerEvent): boolean {
  if (event.pointerType) {
    return event.pointerType === "mouse" || event.pointerType === "pen";
  }

  return window.matchMedia?.("(any-pointer: fine)").matches ?? false;
}

function isToggle(element: HTMLElement): boolean {
  return element.matches(TOGGLE_SELECTOR);
}

function isNavigation(element: HTMLElement): boolean {
  return element.matches(NAVIGATION_SELECTOR);
}

function isTextInput(element: HTMLElement): boolean {
  return element.matches(TEXT_INPUT_SELECTOR);
}

function isKeyboardActivation(event: KeyboardEvent): boolean {
  return !event.repeat && (event.key === "Enter" || event.key === " " || event.key === "Spacebar");
}

export function setInteractionSoundsEnabled(enabled: boolean) {
  setEnabled(enabled);
  if (enabled) {
    document.documentElement.dataset.soundEffects = "on";
  } else {
    delete document.documentElement.dataset.soundEffects;
  }
}

export function previewInteractionSounds() {
  setInteractionSoundsEnabled(true);
  play("ready");
}

export function installInteractionSounds(root: SoundRoot = document): () => void {
  let lastHoverAt = 0;

  const handlePointerOver = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (!isFinePointer(pointerEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element) {
      return;
    }

    if (pointerEvent.relatedTarget instanceof Node && element.contains(pointerEvent.relatedTarget)) {
      return;
    }

    const now = performance.now();
    if (now - lastHoverAt < HOVER_THROTTLE_MS) {
      return;
    }
    lastHoverAt = now;

    play(cueFor(element, isNavigation(element) ? "tick" : "whisper"));
  };

  const handlePointerDown = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (!isFinePointer(pointerEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element || isToggle(element) || isNavigation(element) || isTextInput(element)) {
      return;
    }

    play(cueFor(element, "press"));
  };

  const handlePointerUp = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (!isFinePointer(pointerEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element || isToggle(element) || isNavigation(element) || isTextInput(element)) {
      return;
    }

    play(cueFor(element, "release"));
  };

  const handleClick = (event: Event) => {
    const element = findInteractive(event.target);
    if (!element) {
      return;
    }

    if (isToggle(element)) {
      play(cueFor(element, "toggle"));
    } else if (isNavigation(element)) {
      play(cueFor(element, "page"));
    }
  };

  const handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!isKeyboardActivation(keyboardEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element || isToggle(element) || isNavigation(element) || isTextInput(element)) {
      return;
    }

    play(cueFor(element, "press"));
  };

  const handleKeyUp = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!isKeyboardActivation(keyboardEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element || isToggle(element) || isNavigation(element) || isTextInput(element)) {
      return;
    }

    play(cueFor(element, "release"));
  };

  root.addEventListener("pointerover", handlePointerOver, true);
  root.addEventListener("pointerdown", handlePointerDown, true);
  root.addEventListener("pointerup", handlePointerUp, true);
  root.addEventListener("click", handleClick, true);
  root.addEventListener("keydown", handleKeyDown, true);
  root.addEventListener("keyup", handleKeyUp, true);

  return () => {
    root.removeEventListener("pointerover", handlePointerOver, true);
    root.removeEventListener("pointerdown", handlePointerDown, true);
    root.removeEventListener("pointerup", handlePointerUp, true);
    root.removeEventListener("click", handleClick, true);
    root.removeEventListener("keydown", handleKeyDown, true);
    root.removeEventListener("keyup", handleKeyUp, true);
  };
}
