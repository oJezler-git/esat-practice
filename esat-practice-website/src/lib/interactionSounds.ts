import {
  DEFAULT_SOUND_VOLUME,
  MAX_SOUND_VOLUME,
  MIN_SOUND_VOLUME,
} from "../types/settings";

const HOVER_THROTTLE_MS = 150;
const SLIDER_THROTTLE_MS = 65;
const TYPING_THROTTLE_MS = 35;
const DRAWING_THROTTLE_MS = 110;
const MIN_GAIN = 0.0001;
const STOP_PADDING = 0.05;
const OUTPUT_GAIN_MULTIPLIER = 1.6;
const DRAWING_BED_GAIN = 0.026;
const DRAWING_TONE_GAIN = 0.009;

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
  "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='range']), textarea, [contenteditable='true']";
const RANGE_SELECTOR = "input[type='range']";
const DRAWING_SURFACE_SELECTOR = ".drawing-svg";
const DRAWING_SOUND_TOOLS = new Set([
  "pen",
  "highlighter",
  "line",
  "arrow",
  "rect",
  "ellipse",
  "eraser",
]);
const DISABLED_SELECTOR = ":disabled, [aria-disabled='true']";
const IGNORE_SELECTOR = "[data-sound='off'], [data-cuelume-ignore]";

export type InteractionSoundName =
  | "chime"
  | "sparkle"
  | "droplet"
  | "bloom"
  | "whisper"
  | "tick"
  | "press"
  | "release"
  | "toggle"
  | "success"
  | "error"
  | "page"
  | "loading"
  | "ready"
  | "slider"
  | "typing"
  | "drawingStart"
  | "drawing"
  | "drawingEnd";

type SoundRoot = Document | HTMLElement;
type PlaySound = (sound: InteractionSoundName) => void;

type BaseLayer = {
  offset?: number;
  attack?: number;
  decay: number;
  peak: number;
};

type ToneLayer = BaseLayer & {
  kind: "tone";
  frequency: number;
  waveform?: OscillatorType;
  glideTo?: number;
};

type NoiseLayer = BaseLayer & {
  kind: "noise";
  filterType?: BiquadFilterType;
  filterFrequency: number;
  filterQ?: number;
};

type SoundLayer = ToneLayer | NoiseLayer;
type SoundRecipe = {
  masterGain: number;
  layers: SoundLayer[];
};

const RECIPES: Record<InteractionSoundName, SoundRecipe> = {
  chime: {
    masterGain: 0.55,
    layers: [
      { kind: "tone", frequency: 880, attack: 0.004, decay: 0.12, peak: 0.08 },
      { kind: "tone", frequency: 1320, offset: 0.07, attack: 0.004, decay: 0.18, peak: 0.065 },
    ],
  },
  sparkle: {
    masterGain: 0.5,
    layers: [
      { kind: "tone", frequency: 1568, attack: 0.002, decay: 0.055, peak: 0.055 },
      { kind: "tone", frequency: 2093, offset: 0.04, attack: 0.002, decay: 0.06, peak: 0.045 },
      { kind: "tone", frequency: 3136, offset: 0.08, attack: 0.002, decay: 0.07, peak: 0.035 },
    ],
  },
  droplet: {
    masterGain: 0.55,
    layers: [
      { kind: "tone", frequency: 1150, glideTo: 520, attack: 0.004, decay: 0.18, peak: 0.075 },
    ],
  },
  bloom: {
    masterGain: 0.55,
    layers: [
      { kind: "tone", frequency: 440, attack: 0.04, decay: 0.25, peak: 0.055 },
      { kind: "tone", frequency: 660, offset: 0.025, attack: 0.04, decay: 0.28, peak: 0.04 },
    ],
  },
  whisper: {
    masterGain: 0.35,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 900, attack: 0.018, decay: 0.08, peak: 0.045 },
    ],
  },
  tick: {
    masterGain: 0.5,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 4500, filterQ: 2, decay: 0.018, peak: 0.08 },
      { kind: "tone", frequency: 2400, decay: 0.018, peak: 0.025 },
    ],
  },
  press: {
    masterGain: 0.55,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 1200, filterQ: 1.3, decay: 0.028, peak: 0.1 },
      { kind: "tone", frequency: 180, waveform: "triangle", decay: 0.035, peak: 0.03 },
    ],
  },
  release: {
    masterGain: 0.5,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 3400, filterQ: 1.8, decay: 0.018, peak: 0.08 },
      { kind: "tone", frequency: 2600, offset: 0.006, decay: 0.04, peak: 0.018 },
    ],
  },
  toggle: {
    masterGain: 0.55,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 1800, filterQ: 1.5, decay: 0.017, peak: 0.1 },
      { kind: "noise", filterType: "bandpass", filterFrequency: 3600, filterQ: 1.5, offset: 0.03, decay: 0.02, peak: 0.085 },
    ],
  },
  success: {
    masterGain: 0.6,
    layers: [
      { kind: "tone", frequency: 660, attack: 0.004, decay: 0.075, peak: 0.06 },
      { kind: "tone", frequency: 880, offset: 0.055, attack: 0.004, decay: 0.09, peak: 0.06 },
      { kind: "tone", frequency: 1320, offset: 0.11, attack: 0.004, decay: 0.16, peak: 0.065 },
    ],
  },
  error: {
    masterGain: 0.5,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 700, filterQ: 1.2, decay: 0.04, peak: 0.09 },
      { kind: "tone", frequency: 330, waveform: "triangle", offset: 0.025, decay: 0.11, peak: 0.04 },
      { kind: "tone", frequency: 247, waveform: "triangle", offset: 0.105, decay: 0.14, peak: 0.035 },
    ],
  },
  page: {
    masterGain: 0.52,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 1800, attack: 0.004, decay: 0.07, peak: 0.085 },
      { kind: "noise", filterType: "bandpass", filterFrequency: 4200, offset: 0.035, decay: 0.055, peak: 0.065 },
      { kind: "tone", frequency: 2100, offset: 0.065, decay: 0.035, peak: 0.018 },
    ],
  },
  loading: {
    masterGain: 0.5,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 1300, attack: 0.025, decay: 0.12, peak: 0.035 },
      { kind: "tone", frequency: 390, glideTo: 600, attack: 0.02, decay: 0.16, peak: 0.05 },
    ],
  },
  ready: {
    masterGain: 0.6,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 2800, filterQ: 1.8, decay: 0.018, peak: 0.07 },
      { kind: "tone", frequency: 659, offset: 0.022, attack: 0.01, decay: 0.18, peak: 0.05 },
      { kind: "tone", frequency: 988, offset: 0.022, attack: 0.01, decay: 0.2, peak: 0.035 },
    ],
  },
  slider: {
    masterGain: 0.45,
    layers: [
      { kind: "tone", frequency: 980, glideTo: 1280, attack: 0.001, decay: 0.035, peak: 0.045 },
      { kind: "noise", filterType: "bandpass", filterFrequency: 3000, filterQ: 2, decay: 0.012, peak: 0.035 },
    ],
  },
  typing: {
    masterGain: 0.3,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 2600, filterQ: 1.7, decay: 0.014, peak: 0.05 },
      { kind: "tone", frequency: 720, waveform: "triangle", decay: 0.018, peak: 0.012 },
    ],
  },
  drawingStart: {
    masterGain: 0.2,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 460, filterQ: 0.35, attack: 0.004, decay: 0.06, peak: 0.024 },
      { kind: "tone", frequency: 180, waveform: "triangle", attack: 0.004, decay: 0.055, peak: 0.014 },
    ],
  },
  drawing: {
    masterGain: 0.08,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 420, filterQ: 0.35, attack: 0.03, decay: 0.09, peak: 0.012 },
    ],
  },
  drawingEnd: {
    masterGain: 0.18,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 420, filterQ: 0.35, attack: 0.016, decay: 0.065, peak: 0.018 },
      { kind: "tone", frequency: 220, waveform: "triangle", offset: 0.01, attack: 0.012, decay: 0.06, peak: 0.012 },
    ],
  },
};

const SOUND_NAMES = new Set<InteractionSoundName>(
  Object.keys(RECIPES) as InteractionSoundName[],
);

let enabled = false;
let soundVolume = DEFAULT_SOUND_VOLUME;
let sharedContext: AudioContext | null = null;
let drawingBed: {
  master: GainNode;
  noise: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  tone: OscillatorNode;
  toneGain: GainNode;
} | null = null;

function clampSoundVolume(value: unknown): number {
  const volume = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(volume)) {
    return DEFAULT_SOUND_VOLUME;
  }
  return Math.min(MAX_SOUND_VOLUME, Math.max(MIN_SOUND_VOLUME, Math.round(volume)));
}

function isSoundName(value: string | undefined): value is InteractionSoundName {
  return value !== undefined && SOUND_NAMES.has(value as InteractionSoundName);
}

function cueFor(element: HTMLElement, fallback: InteractionSoundName): InteractionSoundName {
  const override = element.dataset.sound;
  return isSoundName(override) ? override : fallback;
}

function findClosest(target: EventTarget | null, selector: string): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const element = target.closest<HTMLElement>(selector);
  if (!element || element.matches(DISABLED_SELECTOR) || element.closest(IGNORE_SELECTOR)) {
    return null;
  }

  return element;
}

function findInteractive(target: EventTarget | null): HTMLElement | null {
  return findClosest(target, INTERACTIVE_SELECTOR);
}

function findTextInput(target: EventTarget | null): HTMLElement | null {
  return findClosest(target, TEXT_INPUT_SELECTOR);
}

function findRangeInput(target: EventTarget | null): HTMLElement | null {
  return findClosest(target, RANGE_SELECTOR);
}

function findDrawingSurface(target: EventTarget | null): HTMLElement | null {
  const surface = findClosest(target, DRAWING_SURFACE_SELECTOR);
  return surface?.dataset.tool && DRAWING_SOUND_TOOLS.has(surface.dataset.tool) ? surface : null;
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

function isRangeInput(element: HTMLElement): boolean {
  return element.matches(RANGE_SELECTOR);
}

function isGenericPressTarget(element: HTMLElement): boolean {
  return (
    !isToggle(element) &&
    !isNavigation(element) &&
    !isTextInput(element) &&
    !isRangeInput(element)
  );
}

function isKeyboardActivation(event: KeyboardEvent): boolean {
  return !event.repeat && (event.key === "Enter" || event.key === " " || event.key === "Spacebar");
}

function isTypingKey(event: KeyboardEvent): boolean {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  return event.key.length === 1 || event.key === "Backspace" || event.key === "Delete";
}

function getAudioContext(): AudioContext | null {
  if (sharedContext) {
    return sharedContext;
  }
  if (typeof window === "undefined") {
    return null;
  }
  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  try {
    sharedContext = new AudioContextCtor();
  } catch {
    return null;
  }
  return sharedContext;
}

function currentDrawingBedGain(): number {
  return DRAWING_BED_GAIN * currentOutputGain();
}

function currentOutputGain(): number {
  return (soundVolume / 100) * OUTPUT_GAIN_MULTIPLIER;
}

function makeLoopingNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.45));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < length; i += 1) {
    // Strongly correlated noise is smoother and darker than white-noise grains.
    previous = previous * 0.96 + (2 * Math.random() - 1) * 0.04;
    data[i] = previous;
  }
  return buffer;
}

function updateDrawingBedVolume(context: AudioContext) {
  if (!drawingBed) {
    return;
  }
  const now = context.currentTime;
  drawingBed.master.gain.cancelScheduledValues(now);
  drawingBed.master.gain.setTargetAtTime(
    Math.max(currentDrawingBedGain(), MIN_GAIN),
    now,
    0.025,
  );
  drawingBed.toneGain.gain.setTargetAtTime(
    Math.max(DRAWING_TONE_GAIN * currentOutputGain(), MIN_GAIN),
    now,
    0.025,
  );
}

function startDrawingBed(context: AudioContext) {
  if (drawingBed) {
    updateDrawingBedVolume(context);
    return;
  }

  const now = context.currentTime;
  const master = context.createGain();
  const targetGain = Math.max(currentDrawingBedGain(), MIN_GAIN);
  master.gain.setValueAtTime(Math.max(targetGain * 0.35, MIN_GAIN), now);
  master.gain.setTargetAtTime(targetGain, now, 0.008);
  master.connect(context.destination);

  const noise = context.createBufferSource();
  noise.buffer = makeLoopingNoiseBuffer(context);
  noise.loop = true;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 420;
  noiseFilter.Q.value = 0.35;
  noise.connect(noiseFilter).connect(master);
  noise.start(now);

  const tone = context.createOscillator();
  tone.type = "triangle";
  tone.frequency.value = 145;
  const toneGain = context.createGain();
  toneGain.gain.value = DRAWING_TONE_GAIN * currentOutputGain();
  tone.connect(toneGain).connect(master);
  tone.start(now);

  drawingBed = { master, noise, noiseFilter, tone, toneGain };
}

function stopDrawingBed(context: AudioContext) {
  if (!drawingBed) {
    return;
  }

  const bed = drawingBed;
  drawingBed = null;
  const now = context.currentTime;
  bed.master.gain.cancelScheduledValues(now);
  bed.master.gain.setTargetAtTime(MIN_GAIN, now, 0.035);
  bed.toneGain.gain.setTargetAtTime(MIN_GAIN, now, 0.03);

  const stopAt = now + 0.14;
  try {
    bed.noise.stop(stopAt);
    bed.tone.stop(stopAt);
  } catch {
    // The sources may already have been stopped by a pointer-cancel race.
  }

  window.setTimeout(() => {
    bed.noise.disconnect();
    bed.noiseFilter.disconnect();
    bed.tone.disconnect();
    bed.toneGain.disconnect();
    bed.master.disconnect();
  }, 180);
}

function renderTone(context: AudioContext, destination: AudioNode, layer: ToneLayer, startTime: number) {
  const oscillator = context.createOscillator();
  oscillator.type = layer.waveform ?? "sine";
  oscillator.frequency.setValueAtTime(layer.frequency, startTime);
  if (layer.glideTo !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(layer.glideTo, 1),
      startTime + (layer.attack ?? 0.001) + layer.decay,
    );
  }

  const gain = context.createGain();
  const attack = layer.attack ?? 0.001;
  gain.gain.setValueAtTime(MIN_GAIN, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(layer.peak, MIN_GAIN), startTime + attack);
  gain.gain.exponentialRampToValueAtTime(MIN_GAIN, startTime + attack + layer.decay);

  oscillator.connect(gain).connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + attack + layer.decay + STOP_PADDING);
}

function renderNoise(context: AudioContext, destination: AudioNode, layer: NoiseLayer, startTime: number) {
  const attack = layer.attack ?? 0.001;
  const duration = attack + layer.decay + STOP_PADDING;
  const length = Math.max(1, Math.floor(duration * context.sampleRate));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = 2 * Math.random() - 1;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = layer.filterType ?? "bandpass";
  filter.frequency.value = layer.filterFrequency;
  if (layer.filterQ !== undefined) {
    filter.Q.value = layer.filterQ;
  }

  const gain = context.createGain();
  gain.gain.setValueAtTime(MIN_GAIN, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(layer.peak, MIN_GAIN), startTime + attack);
  gain.gain.exponentialRampToValueAtTime(MIN_GAIN, startTime + attack + layer.decay);

  source.connect(filter).connect(gain).connect(destination);
  source.start(startTime);
  source.stop(startTime + duration);
}

function layerEnd(layer: SoundLayer): number {
  return (layer.offset ?? 0) + (layer.attack ?? 0.001) + layer.decay + STOP_PADDING;
}

function renderRecipe(context: AudioContext, recipe: SoundRecipe) {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.value = recipe.masterGain * currentOutputGain();
  master.connect(context.destination);

  for (const layer of recipe.layers) {
    const startTime = now + (layer.offset ?? 0);
    if (layer.kind === "tone") {
      renderTone(context, master, layer, startTime);
    } else {
      renderNoise(context, master, layer, startTime);
    }
  }

  const cleanupAfterMs = (Math.max(...recipe.layers.map(layerEnd)) + 0.05) * 1000;
  window.setTimeout(() => master.disconnect(), cleanupAfterMs);
}

export function setInteractionSoundVolume(value: unknown) {
  soundVolume = clampSoundVolume(value);
  document.documentElement.dataset.soundVolume = String(soundVolume);
  if (sharedContext) {
    updateDrawingBedVolume(sharedContext);
  }
}

export function setInteractionSoundsEnabled(value: boolean) {
  enabled = value;
  if (!enabled && sharedContext) {
    stopDrawingBed(sharedContext);
  }
  if (enabled) {
    document.documentElement.dataset.soundEffects = "on";
  } else {
    delete document.documentElement.dataset.soundEffects;
  }
}

export function playInteractionSound(sound: InteractionSoundName) {
  if (!enabled || soundVolume <= 0) {
    return;
  }
  if (typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive === false) {
    return;
  }
  const context = getAudioContext();
  const recipe = RECIPES[sound];
  if (!context || !recipe) {
    return;
  }

  const render = () => {
    if (sound === "drawingStart") {
      startDrawingBed(context);
      renderRecipe(context, recipe);
      return;
    }
    if (sound === "drawingEnd") {
      stopDrawingBed(context);
      renderRecipe(context, recipe);
      return;
    }
    if (sound === "drawing") {
      return;
    }
    renderRecipe(context, recipe);
  };

  if (context.state === "running") {
    render();
    return;
  }

  try {
    void context.resume().then(() => {
      if (enabled && context.state === "running") {
        render();
      }
    }, () => {});
  } catch {
    // Some browsers throw synchronously when audio is blocked.
  }
}

export function previewInteractionSounds(volume?: number) {
  if (volume !== undefined) {
    setInteractionSoundVolume(volume);
  }
  setInteractionSoundsEnabled(true);
  playInteractionSound("ready");
}

export function installInteractionSounds(
  root: SoundRoot = document,
  playSound: PlaySound = playInteractionSound,
): () => void {
  let lastHoverAt = 0;
  let lastSliderAt = 0;
  let lastTypingAt = 0;
  let lastDrawingAt = 0;
  let activeDrawingPointerId: number | null = null;

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

    playSound(cueFor(element, isNavigation(element) ? "tick" : "whisper"));
  };

  const handlePointerDown = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    const drawingSurface = findDrawingSurface(event.target);
    if (drawingSurface && (pointerEvent.button ?? 0) === 0) {
      activeDrawingPointerId = pointerEvent.pointerId;
      playSound(cueFor(drawingSurface, "drawingStart"));
      return;
    }

    if (!isFinePointer(pointerEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element || !isGenericPressTarget(element)) {
      return;
    }

    playSound(cueFor(element, "press"));
  };

  const handlePointerMove = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (activeDrawingPointerId === null || pointerEvent.pointerId !== activeDrawingPointerId) {
      return;
    }
    if (pointerEvent.buttons !== 1) {
      return;
    }

    const now = performance.now();
    if (now - lastDrawingAt < DRAWING_THROTTLE_MS) {
      return;
    }
    lastDrawingAt = now;
    playSound("drawing");
  };

  const handlePointerUp = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (activeDrawingPointerId !== null && pointerEvent.pointerId === activeDrawingPointerId) {
      activeDrawingPointerId = null;
      playSound("drawingEnd");
      return;
    }

    if (!isFinePointer(pointerEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element || !isGenericPressTarget(element)) {
      return;
    }

    playSound(cueFor(element, "release"));
  };

  const handlePointerCancel = (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (activeDrawingPointerId !== null && pointerEvent.pointerId === activeDrawingPointerId) {
      activeDrawingPointerId = null;
      playSound("drawingEnd");
    }
  };

  const handleWindowBlur = () => {
    if (activeDrawingPointerId !== null) {
      activeDrawingPointerId = null;
      playSound("drawingEnd");
    }
  };

  const handleClick = (event: Event) => {
    const element = findInteractive(event.target);
    if (!element) {
      return;
    }

    if (isToggle(element)) {
      playSound(cueFor(element, "toggle"));
    } else if (isNavigation(element)) {
      playSound(cueFor(element, "page"));
    }
  };

  const handleInput = (event: Event) => {
    const element = findRangeInput(event.target);
    if (!element) {
      return;
    }

    const now = performance.now();
    if (now - lastSliderAt < SLIDER_THROTTLE_MS) {
      return;
    }
    lastSliderAt = now;
    playSound(cueFor(element, "slider"));
  };

  const handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    const textInput = findTextInput(event.target);
    if (textInput && isTypingKey(keyboardEvent)) {
      const now = performance.now();
      if (now - lastTypingAt >= TYPING_THROTTLE_MS) {
        lastTypingAt = now;
        playSound(cueFor(textInput, "typing"));
      }
      return;
    }

    if (!isKeyboardActivation(keyboardEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element || !isGenericPressTarget(element)) {
      return;
    }

    playSound(cueFor(element, "press"));
  };

  const handleKeyUp = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!isKeyboardActivation(keyboardEvent)) {
      return;
    }

    const element = findInteractive(event.target);
    if (!element || !isGenericPressTarget(element)) {
      return;
    }

    playSound(cueFor(element, "release"));
  };

  root.addEventListener("pointerover", handlePointerOver, true);
  root.addEventListener("pointerdown", handlePointerDown, true);
  root.addEventListener("pointermove", handlePointerMove, true);
  root.addEventListener("pointerup", handlePointerUp, true);
  root.addEventListener("pointercancel", handlePointerCancel, true);
  root.addEventListener("click", handleClick, true);
  root.addEventListener("input", handleInput, true);
  root.addEventListener("keydown", handleKeyDown, true);
  root.addEventListener("keyup", handleKeyUp, true);
  window.addEventListener("blur", handleWindowBlur);

  return () => {
    root.removeEventListener("pointerover", handlePointerOver, true);
    root.removeEventListener("pointerdown", handlePointerDown, true);
    root.removeEventListener("pointermove", handlePointerMove, true);
    root.removeEventListener("pointerup", handlePointerUp, true);
    root.removeEventListener("pointercancel", handlePointerCancel, true);
    root.removeEventListener("click", handleClick, true);
    root.removeEventListener("input", handleInput, true);
    root.removeEventListener("keydown", handleKeyDown, true);
    root.removeEventListener("keyup", handleKeyUp, true);
    window.removeEventListener("blur", handleWindowBlur);
  };
}
