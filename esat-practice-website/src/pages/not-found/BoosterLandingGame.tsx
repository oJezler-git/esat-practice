import { useCallback, useEffect, useRef, useState } from "react";

/*
 * "Booster down" — a Falcon 9 first-stage landing toy for the 404 panel.
 * The booster arrives at the re-entry interface ~70 km up doing thousands
 * of km/h, and you fly the real recovery profile: a three-engine entry burn
 * that must be finished before the air thickens at ~40 km (or the stage
 * burns up), a grid-fin coast that bleeds speed and steers toward the ship,
 * then a single-engine landing burn onto the droneship. The camera opens
 * close on the booster at spawn, pulls out wide to cover the entry burn and
 * coast, then zooms back in on final approach — pinning the booster near
 * the top of frame so the droneship is visible below it in good time to
 * line up the landing, rather than popping into view at the last second.
 *
 * Touchdown is NOT an instant win: the booster transitions into a settling
 * phase where it rocks on its leg footprint like a rigid body. Horizontal
 * speed at contact becomes angular momentum about the downhill leg; if the
 * centre of mass swings outside the footprint it tips over (RUD), if it
 * slides off the deck it's lost at sea, and only once it has rocked itself
 * still and upright does the landing count.
 *
 * Same construction as the slingshot game: the field is FLUID in width with
 * every element at fixed pixel size, all physics lives in refs and runs off
 * requestAnimationFrame, and colours are read from the live --sk-* tokens so
 * the scene flips with the theme. Vertical physics is width-independent
 * (height is fixed), so only the spawn position scales with the field.
 */

// Fixed logical height; width is dynamic (= the well's CSS width). Taller
// than the other 404 games — a vertical descent needs the vertical room.
const H = 560;

const RAIL = 16; // brass frame thickness
const WALL_L = RAIL + 6;
const CEIL = RAIL + 6;

const SEA_Y = H - 46; // waterline
const DECK_Y = SEA_Y - 12; // droneship deck — a low, flat barge
const BARGE_HW = 84; // droneship half-width
const PAD_HW = 56; // painted pad ring (visual guide)

// Booster geometry (logical px) — real Falcon 9 first-stage proportions,
// 41.2 m tall by 3.7 m across (about 11:1).
const HH = 33; // half height (centre of mass sits mid-body)
const HW = 3; // half width
const LEG = 14; // half-span of the deployed leg footprint

// World scale: 1 logical px = 10 m, so 100 px = 1 km of altitude.
const PX_PER_KM = 100;
const SPAWN_ALT = 70 * PX_PER_KM; // re-entry interface hand-off, ~70 km
const ENTRY_ALT = 40 * PX_PER_KM; // entry burn must be done by here — thick air below
const SPAWN_VY = 900; // px/s — reads as ~2,250 m/s on the telemetry, Mach 6–7
const RHO_H = 8.5 * PX_PER_KM; // atmospheric density scale height
const DRAG_C = 0.0016; // px^-1 — sea-level terminal velocity ≈ 185 px/s
const HEAT_VEL = 420; // px/s — heating reference speed (heat rate ∝ rho·(v/ref)³)
const HEAT_COOL = 0.35; // heat shed per second
const FIN_AUTH = 0.5; // grid-fin lateral authority, scaled by density × speed
const DISP_MS = 2.5; // telemetry display factor: m/s shown per px/s

// Flight physics.
const GRAVITY = 55; // px / s^2
const ENTRY_ENGINES = 3; // engines lit above ENTRY_ALT — the entry-burn tripod
const THRUST = 120; // px / s^2 along the booster axis, per engine
const ROT_ACC = 1.1; // rad / s^2 — cold-gas only; deliberate, heavy response
const GIMBAL_MAX = 0.24; // rad — how far the engine nozzle can swing
const GIMBAL_TORQUE = 5; // rad / s^2 per rad of deflection, while burning
const ANG_DAMP = 2.6; // angular damping / s — keeps the attitude crisp
const FUEL_MAX = 100;
const BURN = 7; // fuel / s per engine — budget for an entry burn plus the landing burn
const IGN_MAX = 3; // engine relights per drop — hoverslam, not hover
const SPOOL = 0.15; // s for the turbopumps to spool to full thrust
const WIND_SLOW = 5; // px / s^2 — long lazy gust component
const WIND_FAST = 3; // px / s^2 — shorter chop on top

// Touchdown physics.
const VY_CRASH = 80; // legs collapse above this vertical speed
// The stability boundary is implicit in the settle physics: the CoM clears
// the leg foot at asin(LEG / HH) ≈ 30° and the rocking torque runs away.
const FALLEN = 1.15; // rad — past this it's on its side

// Telemetry warning thresholds (advisory — physics decides the outcome).
const VY_WARN = 60;
const VX_WARN = 45;
const ANG_WARN = 0.35;

// Brass hardware palette — matches the slingshot game and the frame.
const BRASS_HI = "#f0d38a";
const BRASS_MID = "#c69a45";
const BRASS_LO = "#7c5a22";
const BRASS_EDGE = "#4a3616";
const HULL_HI = "#e8e2d2";
const HULL_LO = "#8f8878";
const FLAME_HOT = "#fff1c4";
const RCS_GAS = "rgba(235, 240, 245, 0.85)";
const DANGER = "#e06c4f";

type Phase = "descent" | "settle" | "landed" | "crashed";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  max: number;
  r: number;
  kind:
    | "smoke" // pale exhaust / dust
    | "spray" // white water
    | "soot" // dark post-explosion smoke
    | "fireball" // buoyant hot-gas cell, drawn additively
    | "spark" // white-hot sliver on a ballistic arc
    | "debris" // tumbling hull fragment, burns and trails
    | "shock" // expanding blast ring
    | "flash" // blinding core flash
    | "fuse"; // invisible — detonates a secondary pop when it expires
  rot?: number; // debris tumble
  rotVel?: number;
  seed?: number; // per-particle flicker phase
}

// Deterministic hash noise — gives every star a stable position and twinkle
// phase without storing anything.
function srand(i: number, salt: number) {
  const t = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return t - Math.floor(t);
}

// Each way the stage can die gets its own blast character:
//   burnup — high-altitude breakup that streams on downward at speed
//   slam   — pancaked into the deck, blast reflected up and outward
//   tip    — fell over first, fire smeared along the fallen hull
//   splash — quenched by the sea, steam and spray over half-drowned fire
type BlastVariant = "burnup" | "slam" | "tip" | "splash";

// How a blast is shaped by where and how the stage died. Every knob defaults
// to the plain mid-air detonation.
interface BlastOpts {
  vx?: number; // wreck velocity carried into the debris field (airburst)
  vy?: number;
  spreadX?: number; // source smeared over the hull's footprint (tip-over)
  spreadY?: number;
  squash?: number; // < 1 reflects the throw up off a deck and widens it (slam)
  soot?: number; // soot multiplier — thin air and water make less
  sparks?: number; // spark multiplier
  shock?: boolean; // pressure ring — pointless in near-vacuum or steam
  steam?: boolean; // splash: the smoke column is pale steam, not soot
}

// A staged, physical detonation instead of one ring of uniform circles: a
// blinding flash and a racing shockwave, a cluster of buoyant fireball cells
// that balloon and lift off, white-hot sparks on ballistic arcs, tumbling
// hull debris that burns and sheds a smoke trail, a slow soot column, and a
// few fuses that pop the remaining tanks a beat later. `pops` guards the
// recursion — secondary blasts spawn with pops = 0.
function spawnBlast(
  s: GameRefs,
  bx: number,
  by: number,
  power: number,
  pops: number,
  o: BlastOpts = {},
) {
  const P = s.particles;
  if (P.length > 460) return; // runaway guard — plenty on screen already
  const ivx = o.vx ?? 0;
  const ivy = o.vy ?? 0;
  const sprX = o.spreadX ?? 4;
  const sprY = o.spreadY ?? 4;
  const squash = o.squash ?? 1;
  // Source point, jittered over the wreck's footprint.
  const at = (): [number, number] => [
    bx + (Math.random() - 0.5) * 2 * sprX,
    by + (Math.random() - 0.5) * 2 * sprY,
  ];
  // Outward throw. A squashed blast can't push into the deck below it, so
  // the down-hemisphere reflects up and the sideways spread widens.
  const throwV = (sp: number): [number, number] => {
    const a = Math.random() * Math.PI * 2;
    let tvx = Math.cos(a) * sp;
    let tvy = Math.sin(a) * sp;
    if (squash < 1) {
      tvx *= 1.35;
      tvy = -Math.abs(tvy) * squash;
    }
    return [tvx, tvy];
  };

  P.push({
    x: bx, y: by, vx: 0, vy: 0,
    life: 0.13, max: 0.13, r: 46 * power, kind: "flash",
  });
  if (o.shock !== false) {
    P.push({
      x: bx, y: by, vx: 0, vy: 0,
      life: 0.55, max: 0.55, r: 135 * power, kind: "shock",
      seed: squash < 1 ? 0.35 : 1, // seed carries the ring's vertical aspect
    });
  }
  // Fireball — overlapping hot cells thrown outward, slightly upward-biased.
  for (let i = Math.round(26 * power); i > 0; i--) {
    const [px, py] = at();
    const [tvx, tvy] = throwV(Math.random() ** 0.6 * 85 * power);
    P.push({
      x: px, y: py,
      vx: tvx + ivx * 0.25,
      vy: tvy + ivy * 0.25 - 28 * power,
      life: 0.45 + Math.random() * 0.75,
      max: 1.2,
      r: (7 + Math.random() * 13) * power,
      kind: "fireball",
      seed: Math.random() * 10,
    });
  }
  // Sparks.
  for (let i = Math.round(56 * power * (o.sparks ?? 1)); i > 0; i--) {
    const [px, py] = at();
    const [tvx, tvy] = throwV((140 + Math.random() * 320) * power);
    P.push({
      x: px, y: py,
      vx: tvx + ivx * 0.5,
      vy: tvy + ivy * 0.5 - 40,
      life: 0.35 + Math.random() * 0.85,
      max: 1.2,
      r: 0.8 + Math.random() * 0.9,
      kind: "spark",
    });
  }
  // Debris — hull fragments, biased upward, tumbling.
  for (let i = Math.round(14 * power); i > 0; i--) {
    const [px, py] = at();
    const [tvx, tvy] = throwV((60 + Math.random() * 190) * power);
    P.push({
      x: px, y: py,
      vx: tvx + ivx * 0.6,
      vy: tvy + ivy * 0.6 - 80 * power * squash,
      life: 1 + Math.random() * 1.3,
      max: 2.3,
      r: 1.5 + Math.random() * 3,
      kind: "debris",
      rot: Math.random() * Math.PI * 2,
      rotVel: (Math.random() - 0.5) * 14,
      seed: Math.random(),
    });
  }
  // Smoke column — slow, dark, buoyant; outlives the fire. Over water it
  // reads as pale steam instead of soot.
  for (let i = Math.round(16 * power * (o.soot ?? 1)); i > 0; i--) {
    const [px, py] = at();
    const [tvx, tvy] = throwV(Math.random() * 40 * power);
    P.push({
      x: px + (Math.random() - 0.5) * 8,
      y: py + (Math.random() - 0.5) * 8,
      vx: tvx + ivx * 0.15,
      vy: tvy + ivy * 0.15 - 22,
      life: 1.1 + Math.random() * 1.2,
      max: 2.3,
      r: 3 + Math.random() * 5,
      kind: o.steam ? "smoke" : "soot",
    });
  }
  // Secondary pops — r carries the follow-up blast's power. They ride the
  // wreck velocity, so an airburst's pops walk down the debris trail and a
  // tip-over's walk along the fallen hull.
  for (let i = 0; i < pops; i++) {
    const [px, py] = at();
    const [tvx, tvy] = throwV(40 + Math.random() * 110);
    P.push({
      x: px, y: py,
      vx: tvx + ivx * 0.55,
      vy: tvy + ivy * 0.55 - 60 * squash,
      life: 0.18 + Math.random() * 0.45,
      max: 0.7,
      r: 0.4 + Math.random() * 0.3,
      kind: "fuse",
    });
  }
}

interface GameRefs {
  phase: Phase;
  needsSpawn: boolean;
  t: number; // game-clock seconds — slow-motion scales this, not wall time
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number; // 0 = upright, positive = leaning right
  angVel: number;
  gimbal: number; // -1..1 — engine nozzle deflection, eased toward input
  baseX: number; // contact point while settling
  fuel: number;
  ign: number; // engine relights remaining
  lit: boolean; // engine currently lit
  ramp: number; // thrust spool-up, 0..1
  legs: number; // 0 stowed .. 1 deployed
  heat: number; // re-entry heating, 0..1 — 1 is structural failure
  engines: number; // engines lit while burning (3 entry, 1 landing)
  lastAlt: number; // previous frame's altitude, for threshold callouts
  camX: number; // camera world-x of the view's left edge
  camY: number; // camera world-y of the view's top edge
  camZ: number; // camera zoom, 1 = deck level
  shot: number; // camera act — index into SHOTS
  zoomT: number; // shot transition progress, 0..1 (1 = holding the shot)
  zoomDur: number; // seconds for the running transition
  zoomFrom: number; // zoom at the moment the transition started
  anchFrom: number; // anchor at the moment the transition started
  anchor: number; // current frame-anchor fraction
  windP: [number, number]; // gust phases, rerolled each drop
  windDrift: number; // integrated wind — drives the sky motes
  shake: number; // camera shake magnitude, decays
  flash: number; // detonation frame blow-out, decays
  splashX: number; // last splashdown x for the water bulge
  splashT: number; // seconds since splashdown
  callout: string; // radio-chatter caption
  thrust: boolean;
  left: boolean;
  right: boolean;
  crashTimer: number;
  particles: Particle[];
}

// Deck bob and wind run off the game clock so slow-motion stays coherent
// between the physics and the drawing.
function bobAt(t: number) {
  return Math.sin(t / 0.9) * 2;
}
function bobVelAt(t: number) {
  return (Math.cos(t / 0.9) * 2) / 0.9;
}
function windAt(s: GameRefs) {
  return (
    Math.sin(s.t * 0.5 + s.windP[0]) * WIND_SLOW +
    Math.sin(s.t * 1.7 + s.windP[1]) * WIND_FAST
  );
}

function smooth01(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Camera shots, in three acts: a close establishing shot at spawn, a pull-out
// to a wide shot that holds through the entry burn and coast, then a zoom back
// in to deck-level framing on final approach. Each act is a one-way,
// fixed-length transition triggered by crossing an altitude gate — the zoom is
// never slaved to live altitude, so throttling the descent rate can't pump the
// scale of the scene in and out.
const ZOOM_CLOSE = 1.5; // spawn establishing shot — tight on the booster
const ZOOM_MIN = 0.45; // wide shot held through the entry burn / coast
const WIDE_AT = 60 * PX_PER_KM; // gate: pull out to the wide shot
const DECK_AT = 9 * PX_PER_KM; // gate: close back in for final approach

// Vertical frame anchor — how far down the frame the booster sits, as a
// fraction of the view height. The deck shot pulls it toward the top so the
// droneship rides into view below the booster in good time to line up the
// landing, rather than popping in at the last second.
const ANCHOR_FAR = 0.35;
const ANCHOR_NEAR = 0.16;

const SHOTS = [
  { zoom: ZOOM_CLOSE, anchor: ANCHOR_FAR, dur: 1 }, // 0 — spawn close-up
  { zoom: ZOOM_MIN, anchor: ANCHOR_FAR, dur: 2.2 }, // 1 — entry burn / coast
  { zoom: 1, anchor: ANCHOR_NEAR, dur: 2.6 }, // 2 — final approach / deck
] as const;

// Camera position spring stiffness (/s). The position eases toward the
// framing target instead of hard-locking to the booster, so gusts and
// steering jolts nudge the booster within the frame rather than slewing the
// entire scene underneath it.
const CAM_K = 10;

function startShot(s: GameRefs, shot: number) {
  s.shot = shot;
  s.zoomFrom = s.camZ;
  s.anchFrom = s.anchor;
  s.zoomT = 0;
  s.zoomDur = SHOTS[shot].dur;
}

// Camera update — runs AFTER the physics has moved the booster, so the frame
// never lags the motion. The zoom plays out as a fixed-length cinematic
// transition between shots; the position springs toward the framing target.
function updateCamera(s: GameRefs, w: number, dt: number) {
  // One-way altitude gates — burning back up over a gate can't replay a shot.
  const alt = Math.max(0, DECK_Y - (s.y + HH));
  if (s.shot === 0 && alt < WIDE_AT) startShot(s, 1);
  if (s.shot === 1 && alt < DECK_AT) startShot(s, 2);

  if (s.zoomT < 1) s.zoomT = Math.min(1, s.zoomT + dt / s.zoomDur);
  const p = smooth01(s.zoomT);
  const sh = SHOTS[s.shot];
  s.camZ = s.zoomFrom + (sh.zoom - s.zoomFrom) * p;
  s.anchor = s.anchFrom + (sh.anchor - s.anchFrom) * p;

  const vw = w / s.camZ;
  const vh = H / s.camZ;
  // Framing target: booster at the anchor height, ALWAYS horizontally
  // centred (never clamped to the field — the sea, sky, and locator arrow
  // cover an off-field view, and any horizontal clamp yanks the camera
  // sideways mid-zoom), and never looking below the deck line. The vy
  // feed-forward cancels the spring's steady-state lag against the fall, so
  // the booster holds its anchor height even at re-entry speed while lateral
  // wobble still gets filtered by the spring.
  const ty = Math.min(s.y + s.vy / CAM_K - vh * s.anchor, H - vh);
  const tx = s.x - vw / 2;
  const k = 1 - Math.exp(-CAM_K * dt);
  s.camX += (tx - s.camX) * k;
  s.camY += (ty - s.camY) * k;
}

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const get = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    accent: get("--sk-accent", "#e9bd63"),
    text: get("--sk-text", "#f1e6cc"),
    muted: get("--sk-muted", "#a89a82"),
  };
}

interface Props {
  onWin: () => void;
}

export default function BoosterLandingGame({ onWin }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const colorsRef = useRef({ accent: "#e9bd63", text: "#f1e6cc", muted: "#a89a82" });
  const widthRef = useRef(500);
  const onWinRef = useRef(onWin);
  onWinRef.current = onWin;

  const [attempts, setAttempts] = useState(0);
  const [won, setWon] = useState(false);
  const [crashMsg, setCrashMsg] = useState<string | null>(null);

  const g = useRef<GameRefs>({
    phase: "descent",
    needsSpawn: true,
    t: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ang: 0,
    angVel: 0,
    gimbal: 0,
    baseX: 0,
    fuel: FUEL_MAX,
    ign: IGN_MAX,
    lit: false,
    ramp: 0,
    legs: 0,
    heat: 0,
    engines: 1,
    lastAlt: Infinity,
    camX: 0,
    camY: 0,
    camZ: 1,
    shot: 0,
    zoomT: 1,
    zoomDur: 1,
    zoomFrom: 1,
    anchFrom: ANCHOR_FAR,
    anchor: ANCHOR_FAR,
    windP: [0, 0],
    windDrift: 0,
    shake: 0,
    flash: 0,
    splashX: 0,
    splashT: 99,
    callout: "",
    thrust: false,
    left: false,
    right: false,
    crashTimer: 0,
    particles: [],
  });

  const spawn = useCallback(() => {
    const s = g.current;
    const w = widthRef.current;
    s.phase = "descent";
    s.needsSpawn = false;
    // Arrive at the re-entry interface, high and fast, drifting roughly
    // padwards — the entry burn and grid fins close the rest of the gap.
    const side = Math.random() < 0.5 ? -1 : 1;
    s.x = w / 2 + side * (w * 0.18 + Math.random() * w * 0.2);
    s.y = DECK_Y - HH - SPAWN_ALT;
    s.vx = -side * (10 + Math.random() * 20);
    s.vy = SPAWN_VY + Math.random() * 80;
    s.ang = -side * (0.04 + Math.random() * 0.06);
    s.angVel = 0;
    s.gimbal = 0;
    s.fuel = FUEL_MAX;
    s.ign = IGN_MAX;
    s.lit = false;
    s.ramp = 0;
    s.legs = 0;
    s.heat = 0;
    s.engines = 1;
    s.lastAlt = Infinity;
    s.windP = [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2];
    s.shake = 0;
    s.flash = 0;
    s.splashT = 99;
    // Snap the camera straight to the spawn establishing shot — no swooping
    // across 70 km, and no transition already in flight.
    const z = ZOOM_CLOSE;
    s.shot = 0;
    s.zoomT = 1;
    s.zoomDur = 1;
    s.zoomFrom = z;
    s.anchFrom = ANCHOR_FAR;
    s.anchor = ANCHOR_FAR;
    s.camZ = z;
    s.camY = Math.min(s.y - (H / z) * ANCHOR_FAR, H - H / z);
    s.camX = s.x - w / (2 * z);
    s.callout = "STAGE ONE AT ENTRY INTERFACE — 70 KM";
    s.crashTimer = 0;
    s.particles = [];
    setCrashMsg(null);
    setAttempts((n) => n + 1);
  }, []);

  const restart = useCallback(() => {
    setWon(false);
    setAttempts(0);
    spawn();
  }, [spawn]);

  const explode = useCallback(
    (bx: number, by: number, variant: BlastVariant, msg: string) => {
      const s = g.current;
      s.phase = "crashed";
      s.crashTimer = 0;
      s.callout = "";
      // The tanks are the bomb: how much propellant is left decides how big
      // the RUD is. An empty stage pops; full tanks make a proper fireball,
      // and more of them cook off as secondaries.
      const fuelFrac = s.fuel / FUEL_MAX;
      const power = 0.45 + fuelFrac;
      const pops = Math.round(1 + fuelFrac * 2.5);
      const splash = variant === "splash";
      if (splash) {
        // Water remembers the hit: a decaying bulge in the waterline plus a
        // fan of white spray thrown up from the impact point — taller the
        // harder it comes in.
        s.splashX = bx;
        s.splashT = 0;
        const punch = Math.min(1.6, 0.6 + Math.abs(s.vy) / 180);
        for (let i = 0; i < Math.round(24 * punch); i++) {
          s.particles.push({
            x: bx + (Math.random() - 0.5) * 18,
            y: SEA_Y,
            vx: (Math.random() - 0.5) * 200 * punch,
            vy: -(60 + Math.random() * 170) * punch,
            life: 0.5 + Math.random() * 0.6,
            max: 1.1,
            r: 1 + Math.random() * 1.8,
            kind: "spray",
          });
        }
      }
      switch (variant) {
        case "burnup":
          // High-altitude breakup at speed: the debris field inherits the
          // Mach-lots fall and streams on downward. Thin air — all sparks
          // and streak, no pressure ring, hardly any smoke.
          spawnBlast(s, bx, by, power * 1.15, pops, {
            vx: s.vx, vy: s.vy, shock: false, soot: 0.25, sparks: 1.8,
          });
          break;
        case "slam":
          // Pancaked into the deck: the blast can't go down, so it reflects
          // up and rolls wide across the barge under a squashed shock ring.
          spawnBlast(s, bx, by, power, pops, {
            vx: s.vx * 0.4, squash: 0.45, spreadX: 6, soot: 1.3,
          });
          break;
        case "tip":
          // The hull is lying along the deck — the blast is smeared down its
          // length and the tanks pop one after another along the wreck.
          spawnBlast(s, bx, by, power * 0.9, pops + 1, {
            vx: s.vx, spreadX: 24, spreadY: 4, squash: 0.6,
          });
          break;
        case "splash":
          // Water quenches it: a duller flash, half-drowned fire, and a
          // column of steam instead of soot.
          spawnBlast(s, bx, by, power * 0.65, Math.round(fuelFrac * 2), {
            vx: s.vx * 0.3, shock: false, steam: true, sparks: 0.45, soot: 1.2,
          });
          break;
      }
      s.shake = (splash ? 5 : 8) * Math.min(1.4, power);
      s.flash = Math.min(1, (splash ? 0.45 : 0.8) * power);
      setCrashMsg(msg);
    },
    [],
  );

  // Physics step (dt supplied by the RAF loop).
  const step = useCallback(
    (dt: number) => {
      const s = g.current;
      const w = widthRef.current;
      const wallR = w - RAIL - 6;
      const padX = w / 2;

      if (s.needsSpawn) spawn();

      s.t += dt;
      s.splashT += dt;
      s.shake *= Math.max(0, 1 - 5 * dt);
      s.flash *= Math.max(0, 1 - 6 * dt);
      const wind = windAt(s);
      s.windDrift += wind * 2.2 * dt;

      // Particles tick in every phase so explosions play out. Trail particles
      // shed by debris, and fuses due to detonate, are collected first so the
      // array isn't mutated mid-iteration.
      const born: Particle[] = [];
      const booms: Particle[] = [];
      for (const p of s.particles) {
        p.life -= dt;
        if (p.kind === "smoke" || p.kind === "soot") {
          // Billows: drag brings it to a hover, buoyancy lifts it, and the
          // wind carries it along. Soot off a fire rises harder.
          const drag = Math.max(0, 1 - 2.6 * dt);
          p.vx = p.vx * drag + wind * 2 * dt;
          p.vy = p.vy * drag - (p.kind === "soot" ? 30 : 16) * dt;
        } else if (p.kind === "fireball") {
          // Hot gas: heavy drag, strong buoyancy — balloons, then lifts off.
          const drag = Math.max(0, 1 - 3 * dt);
          p.vx = p.vx * drag + wind * 1.2 * dt;
          p.vy = p.vy * drag - 60 * dt;
        } else if (p.kind === "spark") {
          p.vy += GRAVITY * 2 * dt;
          const drag = Math.max(0, 1 - 1.3 * dt);
          p.vx *= drag;
          p.vy *= drag;
        } else if (p.kind === "debris" || p.kind === "fuse") {
          p.vy += GRAVITY * 2.2 * dt;
          if (p.kind === "debris") {
            p.rot = (p.rot ?? 0) + (p.rotVel ?? 0) * dt;
            // Burning fragments shed fire while fresh, smoke as they cool.
            if (s.particles.length + born.length < 380 && Math.random() < 30 * dt) {
              const hot = p.life / p.max > 0.45;
              born.push({
                x: p.x,
                y: p.y,
                vx: p.vx * 0.15 + (Math.random() - 0.5) * 12,
                vy: p.vy * 0.15 + (Math.random() - 0.5) * 12,
                life: (hot ? 0.25 : 0.5) + Math.random() * (hot ? 0.3 : 0.5),
                max: hot ? 0.55 : 1,
                r: 2 + Math.random() * (hot ? 2.5 : 3),
                kind: hot ? "fireball" : "soot",
                seed: Math.random() * 10,
              });
            }
          }
          if (p.kind === "fuse" && p.life <= 0) booms.push(p);
        } else if (p.kind !== "shock" && p.kind !== "flash") {
          p.vy += GRAVITY * 1.4 * dt; // spray
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > SEA_Y && p.kind !== "shock" && p.kind !== "flash") {
          const hitVy = p.vy;
          p.y = SEA_Y;
          p.vy *= -0.3;
          p.vx *= 0.7;
          // Hot debris hits the water with a hiss of spray.
          if (p.kind === "debris" && hitVy > 40 && born.length < 40) {
            born.push({
              x: p.x,
              y: SEA_Y,
              vx: (Math.random() - 0.5) * 50,
              vy: -(25 + Math.random() * 60),
              life: 0.4 + Math.random() * 0.4,
              max: 0.8,
              r: 1 + Math.random() * 1.5,
              kind: "spray",
            });
          }
        }
      }
      s.particles.push(...born);
      s.particles = s.particles.filter((p) => p.life > 0);
      // Spent fuses detonate — the remaining tanks let go one by one.
      for (const b of booms) {
        spawnBlast(s, b.x, Math.min(b.y, SEA_Y), b.r, 0);
        s.shake = Math.max(s.shake, 3.5);
        s.flash = Math.max(s.flash, 0.35);
      }

      if (s.phase === "crashed") {
        s.crashTimer += dt;
        if (s.crashTimer > 2.6) spawn();
        return;
      }

      if (s.phase === "settle") {
        const deckNow = DECK_Y + bobAt(s.t);
        // Engine is shut down — let the nozzle swing back to centre.
        s.gimbal *= Math.max(0, 1 - 8 * dt);
        // Rigid body rocking on the leg footprint. The pivot is the leg foot
        // on the lean side; gravity torques the CoM about it. Inside the
        // footprint that restores upright, outside it runs away and tips.
        const lever = Math.sin(s.ang) * HH - Math.sign(s.ang) * LEG;
        s.angVel += ((3 * GRAVITY * lever) / (HH * HH)) * dt;
        s.angVel *= Math.max(0, 1 - 1.2 * dt);
        const prevAng = s.ang;
        s.ang += s.angVel * dt;
        // Each rock across upright slaps the far leg down — absorbs energy.
        if (prevAng !== 0 && Math.sign(prevAng) !== Math.sign(s.ang)) {
          s.angVel *= 0.55;
        }

        // Residual horizontal speed skids the legs along the deck.
        s.baseX += s.vx * dt;
        s.vx *= Math.max(0, 1 - 4 * dt);

        // Keep the drawn body glued to the contact point on the bobbing deck.
        s.x = s.baseX + Math.sin(s.ang) * HH;
        s.y = deckNow - Math.cos(s.ang) * HH;

        if (Math.abs(s.baseX - padX) > BARGE_HW) {
          explode(s.baseX, SEA_Y, "splash", "Slid off the deck — lost at sea");
          return;
        }
        if (Math.abs(s.ang) > FALLEN) {
          explode(s.x, DECK_Y - 6, "tip", "Tipped over — RUD on the deck");
          return;
        }
        if (Math.abs(s.ang) < 0.04 && Math.abs(s.angVel) < 0.1 && Math.abs(s.vx) < 3) {
          s.phase = "landed";
          s.ang = 0;
          s.angVel = 0;
          s.vx = 0;
          s.x = s.baseX;
          s.y = deckNow - HH;
          s.callout = "THE BOOSTER HAS LANDED";
          setWon(true);
          onWinRef.current();
        }
        updateCamera(s, w, dt);
        return;
      }

      if (s.phase === "landed") {
        // Secured on deck — ride the swell with the barge.
        s.y = DECK_Y + bobAt(s.t) - HH;
        updateCamera(s, w, dt);
        return;
      }

      if (s.phase !== "descent") return;

      const alt = Math.max(0, DECK_Y - (s.y + HH));
      const rho = Math.exp(-alt / RHO_H); // air density fraction, 1 at the deck
      const speed = Math.hypot(s.vx, s.vy);

      // Attitude: cold-gas thrusters push, air resists. The engine nozzle
      // eases toward the steering input; while burning, its deflection both
      // tilts the thrust vector and adds far more torque than the RCS.
      const steer = (s.right ? 1 : 0) - (s.left ? 1 : 0);
      s.gimbal += (steer - s.gimbal) * Math.min(1, 8 * dt);
      s.angVel += steer * ROT_ACC * dt;
      // Grid fins: once the air thickens they both steer the booster sideways
      // toward the pad and weathervane it tail-first — authority grows with
      // density × speed, so they do nothing in near-vacuum.
      s.vx += steer * rho * Math.abs(s.vy) * FIN_AUTH * dt;
      s.angVel -= s.ang * rho * Math.abs(s.vy) * 0.004 * dt;

      // Engine: each burn costs one of a limited stock of relights, and the
      // turbopumps take a moment to spool — commit to the burn, don't feather.
      // Above ENTRY_ALT three engines light (the entry burn); below, one.
      s.engines = alt > ENTRY_ALT ? ENTRY_ENGINES : 1;
      if (s.thrust && !s.lit && s.ign > 0 && s.fuel > 0) {
        s.ign -= 1;
        s.lit = true;
        s.ramp = 0;
        s.callout =
          alt > ENTRY_ALT ? "ENTRY BURN — THREE ENGINES" : "LANDING BURN IGNITION";
      }
      if (!s.thrust || s.fuel <= 0) {
        s.lit = false;
        s.ramp = 0;
      }
      if (s.lit) {
        s.ramp = Math.min(1, s.ramp + dt / SPOOL);
        const jet = s.ang - s.gimbal * GIMBAL_MAX; // deflected thrust vector
        const power = THRUST * s.engines * s.ramp;
        s.vx += Math.sin(jet) * power * dt;
        s.vy += -Math.cos(jet) * power * dt;
        s.angVel += s.gimbal * GIMBAL_MAX * GIMBAL_TORQUE * s.ramp * dt;
        s.fuel = Math.max(0, s.fuel - BURN * s.engines * s.ramp * dt);
        // Exhaust smoke pours out of the nozzle along the jet vector.
        if (s.particles.length < 130) {
          const ex = s.x - Math.sin(s.ang) * (HH + 3);
          const ey = s.y + Math.cos(s.ang) * (HH + 3);
          for (let i = 0; i < s.engines + 1; i++) {
            s.particles.push({
              x: ex + (Math.random() - 0.5) * 3,
              y: ey,
              vx: s.vx * 0.3 - Math.sin(jet) * 65 + (Math.random() - 0.5) * 34,
              vy: s.vy * 0.3 + Math.cos(jet) * 65 + (Math.random() - 0.5) * 20,
              life: 0.45 + Math.random() * 0.7,
              max: 1.15,
              r: 1.4 + Math.random() * 2.4,
              kind: "smoke",
            });
          }
        }
      }
      s.angVel *= Math.max(0, 1 - ANG_DAMP * dt);
      s.ang += s.angVel * dt;
      s.vy += GRAVITY * dt;
      s.vx += wind * rho * dt; // gusts live in the lower atmosphere
      // Aerodynamic drag — thickens exponentially on the way down, so the
      // stage bleeds speed through the coast without any burn at all.
      const drag = DRAG_C * rho * speed;
      s.vx -= s.vx * drag * dt;
      s.vy -= s.vy * drag * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // Re-entry heating ∝ density × speed³. Skipping the entry burn means
      // hitting the thick air below 40 km at Mach lots — and burning up.
      s.heat = Math.max(
        0,
        s.heat + (rho * (speed / HEAT_VEL) ** 3 - HEAT_COOL) * dt,
      );
      if (s.heat >= 1) {
        explode(s.x, s.y, "burnup", "Burned up on re-entry — hit thick air too fast");
        return;
      }

      // Altitude callouts pacing the profile.
      const crossed = (m: number) => s.lastAlt > m && alt <= m;
      if (crossed(5600) && !s.lit) s.callout = "ENTRY BURN WINDOW — LIGHT ENGINES";
      if (crossed(ENTRY_ALT)) s.callout = "THROUGH 40 KM — GRID FINS ACTIVE";
      if (crossed(900) && !s.lit) s.callout = "LANDING BURN WINDOW";
      s.lastAlt = alt;

      // Legs deploy on final approach.
      if (alt < 120) {
        if (s.legs === 0) s.callout = "LANDING LEGS DEPLOYED";
        s.legs = Math.min(1, s.legs + dt * 2.2);
      }

      // Keep it inside the frame horizontally. (No ceiling — the descent
      // starts far above the visible well.)
      if (s.x - HW < WALL_L) {
        s.x = WALL_L + HW;
        s.vx = Math.abs(s.vx) * 0.4;
      } else if (s.x + HW > wallR) {
        s.x = wallR - HW;
        s.vx = -Math.abs(s.vx) * 0.4;
      }

      // Base of the booster (centre minus the up vector).
      const bx = s.x - Math.sin(s.ang) * HH;
      const by = s.y + Math.cos(s.ang) * HH;

      const deckNow = DECK_Y + bobAt(s.t);
      if (by >= deckNow && Math.abs(bx - padX) <= BARGE_HW) {
        // Impact speed is relative to the heaving deck — catching it on the
        // down-swing is a touch softer, like the real droneship.
        if (s.vy - bobVelAt(s.t) > VY_CRASH) {
          explode(bx, deckNow, "slam", "Came in too hot — legs collapsed");
        } else {
          // Touchdown: legs take the vertical hit; horizontal speed becomes
          // angular momentum about the contact point. Now it has to settle.
          s.phase = "settle";
          s.baseX = bx;
          s.shake = 1.5 + s.vy * 0.04;
          s.callout = "TOUCHDOWN — STANDBY";
          s.angVel += (s.vx / HH) * 0.85;
          s.vx *= 0.4;
          s.vy = 0;
          s.legs = 1;
          s.thrust = false;
          s.lit = false;
          s.ramp = 0;
          // Dust and steam kick out sideways from under the legs.
          for (let i = 0; i < 14; i++) {
            const dir = i % 2 === 0 ? -1 : 1;
            s.particles.push({
              x: bx + dir * (2 + Math.random() * LEG),
              y: DECK_Y - 2,
              vx: dir * (25 + Math.random() * 55),
              vy: -(4 + Math.random() * 26),
              life: 0.4 + Math.random() * 0.5,
              max: 0.9,
              r: 1.6 + Math.random() * 3,
              kind: "smoke",
            });
          }
        }
      } else if (by >= SEA_Y + 4) {
        explode(bx, SEA_Y, "splash", "Missed the droneship — splashdown");
      }

      // Camera frames the post-integration position; freeze it on a crash.
      // (Cast: explode() above may have flipped the phase, which TS's
      // narrowing can't see.)
      if ((s.phase as Phase) !== "crashed") updateCamera(s, w, dt);
    },
    [spawn, explode],
  );

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const s = g.current;
    const c = colorsRef.current;
    const W = widthRef.current;
    const padX = W / 2;
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);

    // Camera shake — the whole cabinet jolts on impacts, then rings down.
    ctx.save();
    if (s.shake > 0.05) {
      ctx.translate(
        (Math.random() - 0.5) * 2 * s.shake,
        (Math.random() - 0.5) * 2 * s.shake,
      );
    }
    // Game-clock ms for anything the physics must agree with (deck, waves).
    const tms = s.t * 1000;

    // Night-sky vignette — same warm void as the slingshot table.
    const bg = ctx.createRadialGradient(W / 2, H * 0.3, 40, W / 2, H * 0.5, W * 0.85);
    bg.addColorStop(0, "rgba(70, 52, 26, 0.3)");
    bg.addColorStop(1, "rgba(0, 0, 0, 0.3)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Camera state for this frame.
    const cz = s.camZ;
    const camX = s.camX;
    const camY = s.camY;
    const vw = W / cz;
    const vh = H / cz;
    // How high the camera is looking — fades the backdrop toward space.
    const spaceT = smooth01((DECK_Y - (camY + vh * 0.6)) / 3500);
    ctx.fillStyle = `rgba(2, 4, 8, ${0.45 * spaceT})`;
    ctx.fillRect(0, 0, W, H);

    // Starfield — stable positions from hash noise, slow independent twinkle.
    const nStars = Math.round(W / 9);
    ctx.fillStyle = "#f5ead0";
    for (let i = 0; i < nStars; i++) {
      const sx = WALL_L + srand(i, 1) * (W - WALL_L * 2);
      const sy = CEIL + 4 + srand(i, 2) * (H - CEIL - 60);
      const tw = 0.5 + 0.5 * Math.sin(now / (500 + srand(i, 3) * 900) + i * 1.7);
      const big = srand(i, 4) > 0.85;
      ctx.globalAlpha =
        ((big ? 0.16 : 0.09) + (big ? 0.34 : 0.22) * tw) * (0.55 + 0.65 * spaceT);
      const d = big ? 1.6 : 1;
      ctx.fillRect(sx, sy, d, d);
    }
    ctx.globalAlpha = 1;

    // Wind — barely-there motes streaming across the sky with the gusts,
    // stretched into streaks by the current wind strength.
    const wind = windAt(s);
    const span = W - WALL_L * 2;
    ctx.strokeStyle = "#e8eef2";
    ctx.lineWidth = 1;
    ctx.globalAlpha =
      (0.03 + 0.05 * Math.min(1, Math.abs(wind) / 8)) * (1 - spaceT * 0.9);
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const drift = s.windDrift * (0.6 + srand(i, 8) * 0.8);
      const mx = WALL_L + ((((srand(i, 7) * span + drift) % span) + span) % span);
      const my = CEIL + 16 + srand(i, 9) * (SEA_Y - CEIL - 110);
      ctx.moveTo(mx, my);
      ctx.lineTo(mx - wind * 1.4, my + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Etched "404" on the back wall, up in the sky.
    ctx.save();
    ctx.font = "700 96px var(--font-display, Georgia), serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillText("404", W / 2, 96);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.strokeText("404", W / 2, 97);
    ctx.restore();

    // ---- World space: everything the camera flies over. ----
    ctx.save();
    ctx.scale(cz, cz);
    ctx.translate(-camX, -camY);
    const wx0 = camX;
    const wx1 = camX + vw;
    const wy1 = camY + vh;

    // Cloud decks — puffs pinned at fixed altitudes, the main speed cue on
    // the way down. Most sit low; a few wisps ride high.
    for (let i = 0; i < 16; i++) {
      const calt = 120 + srand(i, 11) ** 1.6 * 1500;
      const cy = DECK_Y - calt;
      if (cy < camY - 90 || cy > wy1 + 90) continue;
      const cx =
        -W +
        srand(i, 12) * (W * 3) +
        s.windDrift * (0.15 + srand(i, 13) * 0.25);
      const cr = 26 + srand(i, 14) * 48;
      ctx.fillStyle = `rgba(224, 222, 212, ${0.045 + srand(i, 15) * 0.035})`;
      for (const [ox, oy, sc] of [
        [0, 0, 1],
        [-0.55, 0.12, 0.6],
        [0.5, 0.1, 0.55],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(cx + ox * cr, cy + oy * cr, cr * sc, cr * sc * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Haze over the ocean — the atmosphere thickening as the deck nears.
    if (wy1 > SEA_Y - 400) {
      const haze = ctx.createLinearGradient(0, SEA_Y - 320, 0, SEA_Y);
      haze.addColorStop(0, "rgba(180, 190, 200, 0)");
      haze.addColorStop(1, "rgba(180, 190, 200, 0.05)");
      ctx.fillStyle = haze;
      ctx.fillRect(wx0 - 4, SEA_Y - 320, vw + 8, 320);
    }

    // Ocean — spans the whole camera view; the brass rails clip it on screen.
    const sea = ctx.createLinearGradient(0, SEA_Y, 0, H);
    sea.addColorStop(0, "rgba(18, 30, 38, 0.85)");
    sea.addColorStop(1, "rgba(6, 12, 16, 0.95)");
    ctx.fillStyle = sea;
    ctx.fillRect(wx0 - 4, SEA_Y, vw + 8, Math.max(4, wy1 - SEA_Y));
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const ox0 = Math.floor((wx0 - 4) / 4) * 4;
    for (let x = ox0; x <= wx1 + 4; x += 4) {
      let y = SEA_Y + Math.sin(x / 26 + tms / 700) * 1.6;
      // Splashdown leaves a ripple: a gaussian bulge that rings and decays.
      if (s.splashT < 1.6) {
        const d = (x - s.splashX) / 26;
        y -=
          Math.exp(-d * d) *
          Math.sin(s.splashT * 12) *
          7 *
          Math.exp(-s.splashT * 2.2);
      }
      if (x === ox0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Fainter secondary swells below the surface line.
    ctx.lineWidth = 1;
    for (const [dy, alpha, phase] of [
      [9, 0.06, 2.1],
      [19, 0.035, 4.4],
    ] as const) {
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      const sx0 = Math.floor((wx0 - 5) / 5) * 5;
      for (let x = sx0; x <= wx1 + 5; x += 5) {
        const y = SEA_Y + dy + Math.sin(x / 32 + tms / 900 + phase) * 1.8;
        if (x === sx0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // The burn reflects off the water as a shimmering smear below the booster.
    const burnLive = s.phase === "descent" && s.lit && s.fuel > 0;
    const burnGain = 0.35 + 0.65 * s.ramp; // spool-up scales all engine light
    if (burnLive) {
      const rx = Math.min(Math.max(s.x, RAIL + 8), W - RAIL - 8);
      const refl = ctx.createLinearGradient(0, SEA_Y, 0, SEA_Y + 44);
      refl.addColorStop(0, FLAME_HOT);
      refl.addColorStop(0.5, c.accent);
      refl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = (0.12 + Math.random() * 0.08) * burnGain;
      ctx.fillStyle = refl;
      const wob = 3 + Math.sin(now / 130) * 1.2;
      ctx.fillRect(rx - wob, SEA_Y, wob * 2, 44);
      ctx.globalAlpha = 1;
    }

    // Droneship — a brass-railed barge bobbing on the swell. The bob comes
    // from the game clock so the physics lands on the same deck we draw.
    const bob = bobAt(s.t);
    const deckY = DECK_Y + bob;
    ctx.save();
    const hull = ctx.createLinearGradient(0, deckY, 0, SEA_Y + 10);
    hull.addColorStop(0, "#3a3227");
    hull.addColorStop(1, "#171310");
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(padX - BARGE_HW, deckY);
    ctx.lineTo(padX + BARGE_HW, deckY);
    ctx.lineTo(padX + BARGE_HW - 8, SEA_Y + 8);
    ctx.lineTo(padX - BARGE_HW + 8, SEA_Y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Deck equipment on the stern, like the real barge.
    ctx.fillStyle = "#241f18";
    ctx.fillRect(padX + BARGE_HW - 16, deckY - 6, 12, 6);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(padX + BARGE_HW - 16, deckY - 6, 12, 6);

    // Brass deck edge.
    const edge = ctx.createLinearGradient(0, deckY - 4, 0, deckY + 2);
    edge.addColorStop(0, BRASS_HI);
    edge.addColorStop(0.6, BRASS_MID);
    edge.addColorStop(1, BRASS_EDGE);
    ctx.fillStyle = edge;
    ctx.fillRect(padX - BARGE_HW, deckY - 4, BARGE_HW * 2, 5);

    // Painted pad circle at deck centre, seen in shallow perspective.
    ctx.strokeStyle = c.accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(padX, deckY - 1.5, 20, 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Navigation lights — port red, starboard green, alternating slow blink.
    const blink = Math.sin(now / 480);
    for (const [dir, color, on] of [
      [-1, "#e0554a", blink > -0.15],
      [1, "#4ecf7a", -blink > -0.15],
    ] as const) {
      const lx = padX + dir * (BARGE_HW - 3);
      ctx.strokeStyle = "#241f18";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lx, deckY - 4);
      ctx.lineTo(lx, deckY - 9);
      ctx.stroke();
      if (on) {
        const halo = ctx.createRadialGradient(lx, deckY - 10, 0.5, lx, deckY - 10, 6);
        halo.addColorStop(0, color);
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = halo;
        ctx.fillRect(lx - 6, deckY - 16, 12, 12);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = on ? color : "#3a3227";
      ctx.beginPath();
      ctx.arc(lx, deckY - 10, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pad target ring + centreline.
    const pulse = 0.5 + 0.5 * Math.sin(now / 460);
    ctx.strokeStyle = c.accent;
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX - PAD_HW, deckY - 5);
    ctx.lineTo(padX - PAD_HW, deckY - 12);
    ctx.moveTo(padX + PAD_HW, deckY - 5);
    ctx.lineTo(padX + PAD_HW, deckY - 12);
    ctx.stroke();
    ctx.globalAlpha = 0.35 + 0.3 * pulse;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(padX - PAD_HW, deckY - 5);
    ctx.lineTo(padX + PAD_HW, deckY - 5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.muted;
    ctx.font = "600 8px var(--font-mono, monospace)";
    ctx.textAlign = "center";
    ctx.fillText("OF COURSE I STILL LOVE YOU", padX, deckY + 10);
    ctx.restore();

    // Booster shadow on the deck — sharpens and darkens as it comes down.
    if (s.phase !== "crashed") {
      const grounded = s.phase === "settle" || s.phase === "landed";
      const alt = grounded ? 0 : deckY - (s.y + HH);
      if (alt < 170 && Math.abs(s.x - padX) < BARGE_HW + 24) {
        const prox = 1 - Math.max(0, alt) / 170;
        const shx = Math.min(Math.max(s.x, padX - BARGE_HW), padX + BARGE_HW);
        ctx.fillStyle = "#000";
        ctx.globalAlpha = 0.1 + 0.28 * prox;
        ctx.beginPath();
        ctx.ellipse(shx, deckY - 1, 26 - 10 * prox, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Engine light washes over the deck on a low burn.
      if (burnLive) {
        const bx = s.x - Math.sin(s.ang) * HH;
        const galt = deckY - (s.y + HH);
        if (galt < 90 && galt > -10 && Math.abs(bx - padX) < BARGE_HW + 30) {
          const glow = ctx.createRadialGradient(bx, deckY, 4, bx, deckY, 55);
          glow.addColorStop(0, c.accent);
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = 0.22 * (1 - galt / 90) * burnGain;
          ctx.fillStyle = glow;
          ctx.fillRect(bx - 55, deckY - 10, 110, 14);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Booster. (While grounded the physics already glues y to the bobbing
    // deck, so no draw-side bob offset is needed.)
    if (s.phase !== "crashed") {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);

      // Re-entry plasma — a sheath that builds with heating and streams back
      // up the hull, tail-first into the flow.
      if (s.phase === "descent" && s.heat > 0.04) {
        const h = Math.min(1, s.heat);
        const tail = -HH * (1 + 1.8 * h);
        const sheath = ctx.createLinearGradient(0, HH + 6, 0, tail);
        sheath.addColorStop(0, `rgba(255, 190, 110, ${0.5 * h})`);
        sheath.addColorStop(0.35, `rgba(255, 130, 60, ${0.22 * h})`);
        sheath.addColorStop(1, "rgba(255, 90, 40, 0)");
        ctx.fillStyle = sheath;
        ctx.beginPath();
        ctx.moveTo(-HW - 3 - 5 * h, HH + 5);
        ctx.lineTo(HW + 3 + 5 * h, HH + 5);
        ctx.lineTo(HW * 0.6, tail);
        ctx.lineTo(-HW * 0.6, tail);
        ctx.closePath();
        ctx.fill();
        // Hot shock at the base, flickering with the heat load.
        const shock = ctx.createRadialGradient(0, HH + 3, 1, 0, HH + 3, 15 + 12 * h);
        shock.addColorStop(0, `rgba(255, 226, 170, ${(0.4 + Math.random() * 0.15) * h})`);
        shock.addColorStop(1, "rgba(255, 120, 50, 0)");
        ctx.fillStyle = shock;
        ctx.fillRect(-30, HH - 24, 60, 56);
      }

      // Landing legs — stowed flat along the hull, then telescopic pushers
      // drive them outward so they rotate down about a hinge near the base.
      const ease = s.legs * s.legs * (3 - 2 * s.legs); // smoothstep
      const theta = ease * 2.1; // 0 = up along the hull, 2.1 = planted
      const hingeY = HH - 6; // hinged just above the engine skirt
      const LLEN = 14;
      for (const dir of [-1, 1]) {
        const hx = dir * HW;
        const fx = hx + dir * Math.sin(theta) * LLEN;
        const fy = hingeY - Math.cos(theta) * LLEN;
        // Pusher strut from the lower hull to mid-leg.
        ctx.strokeStyle = HULL_LO;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, HH - 11);
        ctx.lineTo(hx + dir * Math.sin(theta) * LLEN * 0.55, hingeY - Math.cos(theta) * LLEN * 0.55);
        ctx.stroke();
        // The leg itself.
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx, hingeY);
        ctx.lineTo(fx, fy);
        ctx.stroke();
      }

      // Engine nozzle + flame — gimballed together about the mount, so the
      // nozzle visibly swings with steering input and the flame follows.
      ctx.save();
      ctx.translate(0, HH - 6);
      ctx.rotate(s.gimbal * GIMBAL_MAX);
      if (burnLive) {
        // Warm halo around the engine — lights the whole lower booster, and
        // swells when the entry burn lights three engines at once.
        const hr = 38 + (s.engines - 1) * 6;
        const halo = ctx.createRadialGradient(0, 12, 2, 0, 12, hr);
        halo.addColorStop(0, FLAME_HOT);
        halo.addColorStop(0.4, c.accent);
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = (0.28 + Math.random() * 0.08) * burnGain;
        ctx.fillStyle = halo;
        ctx.fillRect(-hr, -18, hr * 2, 30 + hr);
        ctx.globalAlpha = 1;
        // Flames grow out of the skirt as the pumps spool — one plume for the
        // landing burn, a fan of three for the entry burn.
        const len = (22 + Math.random() * 14) * burnGain;
        const flame = ctx.createLinearGradient(0, 7, 0, 7 + len);
        flame.addColorStop(0, FLAME_HOT);
        flame.addColorStop(0.4, c.accent);
        flame.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = flame;
        const jets = s.engines === 3 ? [-3.2, 0, 3.2] : [0];
        for (const jx of jets) {
          const jlen = len * (jx === 0 ? 1 : 0.8);
          ctx.beginPath();
          ctx.moveTo(jx - 2.5, 6);
          ctx.lineTo(jx + 2.5, 6);
          ctx.lineTo(jx * 1.8, 7 + jlen);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.fillStyle = "#3a352c";
      ctx.beginPath();
      ctx.moveTo(-1.8, 0);
      ctx.lineTo(1.8, 0);
      ctx.lineTo(3, 8);
      ctx.lineTo(-3, 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Cold-gas side thrusters near the top. To pitch right the jet fires
      // out of the left face (pushing the nose right), and vice versa.
      if (s.phase === "descent" && (s.left || s.right)) {
        const dir = s.right ? -1 : 1; // side the plume exits from
        const jl = 10 + Math.random() * 7;
        const jy = -HH + 10;
        const jet = ctx.createLinearGradient(dir * HW, jy, dir * (HW + jl), jy);
        jet.addColorStop(0, RCS_GAS);
        jet.addColorStop(1, "rgba(235,240,245,0)");
        ctx.fillStyle = jet;
        ctx.beginPath();
        ctx.moveTo(dir * HW, jy - 2);
        ctx.lineTo(dir * HW, jy + 2);
        ctx.lineTo(dir * (HW + jl), jy + 4.5);
        ctx.lineTo(dir * (HW + jl), jy - 4.5);
        ctx.closePath();
        ctx.fill();
      }

      // Passive LOX venting — a lazy wisp off the top while falling.
      if (s.phase === "descent") {
        const drift = Math.sin(now / 340) * 3;
        const vent = ctx.createRadialGradient(drift, -HH - 7, 1, drift, -HH - 7, 8);
        vent.addColorStop(0, "rgba(235,240,245,0.22)");
        vent.addColorStop(1, "rgba(235,240,245,0)");
        ctx.fillStyle = vent;
        ctx.beginPath();
        ctx.arc(drift, -HH - 7, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hull.
      const body = ctx.createLinearGradient(-HW, 0, HW, 0);
      body.addColorStop(0, HULL_LO);
      body.addColorStop(0.35, HULL_HI);
      body.addColorStop(1, HULL_LO);
      ctx.fillStyle = body;
      ctx.fillRect(-HW, -HH, HW * 2, HH * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-HW, -HH, HW * 2, HH * 2);

      // Re-entry soot — the lower hull is scorched, fading up the body.
      const soot = ctx.createLinearGradient(0, -HH * 0.2, 0, HH);
      soot.addColorStop(0, "rgba(26,21,15,0)");
      soot.addColorStop(1, "rgba(26,21,15,0.55)");
      ctx.fillStyle = soot;
      ctx.fillRect(-HW, -HH * 0.2, HW * 2, HH * 1.2);
      ctx.fillStyle = "rgba(26,21,15,0.3)";
      ctx.fillRect(-HW + 1, -HH * 0.1, 1, HH);

      // Interstage band + engine skirt.
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(-HW, -HH, HW * 2, 6);
      ctx.fillRect(-HW, HH - 5, HW * 2, 5);

      // Grid fins — little brass waffles near the top.
      ctx.fillStyle = BRASS_MID;
      ctx.strokeStyle = BRASS_EDGE;
      for (const dir of [-1, 1]) {
        ctx.fillRect(dir * HW + (dir === 1 ? 0 : -3), -HH + 8, 3, 6);
        ctx.strokeRect(dir * HW + (dir === 1 ? 0 : -3), -HH + 8, 3, 6);
      }

      // Anti-collision beacon on the nose — short double-flash strobe.
      const tt = now % 1400;
      if (tt < 90 || (tt > 180 && tt < 270)) {
        const beacon = ctx.createRadialGradient(0, -HH - 2, 0.3, 0, -HH - 2, 7);
        beacon.addColorStop(0, "#ffb3a0");
        beacon.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = beacon;
        ctx.fillRect(-7, -HH - 9, 14, 14);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ff8570";
        ctx.beginPath();
        ctx.arc(0, -HH - 2, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Explosion / splash / smoke particles — smoke, spray, and debris in
    // normal paint first, then everything hot in a single additive pass so
    // overlapping fire genuinely glows instead of stacking flat discs.
    for (const p of s.particles) {
      const t = Math.max(0, p.life / p.max);
      if (p.kind === "smoke" || p.kind === "soot") {
        // Smoke fades and swells as it dies; soot is darker and heavier.
        ctx.globalAlpha = t * (p.kind === "soot" ? 0.42 : 0.3);
        ctx.fillStyle = p.kind === "soot" ? "#211b15" : "#cfc7b8";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (2 - t), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "spray") {
        // White water thrown up by a splashdown.
        ctx.globalAlpha = t * 0.65;
        ctx.fillStyle = "#dde8ec";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "debris") {
        // Tumbling hull fragment, still glowing where it tore off.
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot ?? 0);
        const len = p.r * 2.6;
        ctx.globalAlpha = Math.min(1, t * 2.5);
        ctx.fillStyle = HULL_LO;
        ctx.fillRect(-len / 2, -p.r / 2, len, p.r);
        ctx.globalAlpha = Math.min(1, t * 2.5) * t;
        ctx.fillStyle = "#ff9a4d";
        ctx.fillRect(-len / 2, -p.r / 2, len * 0.4, p.r);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of s.particles) {
      const t = Math.max(0, p.life / p.max);
      if (p.kind === "fireball") {
        // Hot-gas cell: white core cooling through orange to deep red, with
        // a fast per-cell flicker so the fireball's surface boils.
        const flick = 0.85 + 0.3 * Math.sin(now / 37 + (p.seed ?? 0) * 17);
        const r = p.r * (0.5 + 1.1 * (1 - t)) * flick;
        const fb = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        fb.addColorStop(0, `rgba(255, 244, 210, ${0.9 * t})`);
        fb.addColorStop(0.35, `rgba(255, 158, 54, ${0.65 * t})`);
        fb.addColorStop(0.75, `rgba(210, 62, 22, ${0.3 * t})`);
        fb.addColorStop(1, "rgba(120, 20, 8, 0)");
        ctx.fillStyle = fb;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "spark") {
        // Streak along the velocity — white-hot young, orange as it cools.
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.strokeStyle = t > 0.5 ? "#fff3cf" : "#ff9448";
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.kind === "flash") {
        const fl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        fl.addColorStop(0, `rgba(255, 252, 240, ${0.95 * t})`);
        fl.addColorStop(0.5, `rgba(255, 210, 130, ${0.5 * t})`);
        fl.addColorStop(1, "rgba(255, 150, 60, 0)");
        ctx.fillStyle = fl;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "shock") {
        // Blast ring races out fast, then decelerates and thins away. A
        // deck-level blast squashes it into a low dome (aspect in seed).
        const prog = 1 - t;
        const r = p.r * (1 - (1 - prog) ** 2.2);
        ctx.globalAlpha = t * 0.5;
        ctx.strokeStyle = "rgb(255, 226, 180)";
        ctx.lineWidth = 0.75 + 2.5 * t;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * (p.seed ?? 1), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.restore(); // ---- end world space ----

    // Detonation blow-out — the whole frame whites over for a beat, then
    // rings down with the shake.
    if (s.flash > 0.02) {
      ctx.fillStyle = `rgba(255, 233, 190, ${0.55 * s.flash})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Droneship locator — the ship is often out of frame during the fall, so
    // when it isn't visible, point to it from the edge of the well.
    if (s.phase === "descent" || s.phase === "settle") {
      const marginL = RAIL + 12;
      const marginR = W - RAIL - 12;
      const marginT = RAIL + 12;
      const marginB = H - RAIL - 12;
      const padSX = (padX - camX) * cz;
      const padSY = (deckY - camY) * cz;
      const onScreen =
        padSX >= marginL && padSX <= marginR && padSY >= marginT && padSY <= marginB;
      if (!onScreen) {
        const ccx = (marginL + marginR) / 2;
        const ccy = (marginT + marginB) / 2;
        const ang = Math.atan2(padSY - ccy, padSX - ccx);
        const halfW = marginR - ccx;
        const halfH = marginB - ccy;
        const t = Math.min(
          halfW / Math.max(1e-6, Math.abs(Math.cos(ang))),
          halfH / Math.max(1e-6, Math.abs(Math.sin(ang))),
        );
        const px = ccx + Math.cos(ang) * t;
        const py = ccy + Math.sin(ang) * t;
        const dist = Math.hypot(padX - s.x, deckY - s.y) / PX_PER_KM;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = c.accent;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-5, -5.5);
        ctx.lineTo(-5, 5.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.globalAlpha = 0.8;
        ctx.fillStyle = c.muted;
        ctx.font = "600 8px var(--font-mono, monospace)";
        ctx.textAlign = "center";
        const lx = px - Math.cos(ang) * 13;
        const ly = py - Math.sin(ang) * 13 + 3;
        ctx.fillText(`SHIP ${dist.toFixed(1)}KM`, lx, ly);
        ctx.globalAlpha = 1;
      }
    }

    // Altitude ruler — faint 10 km gridlines so the drop reads at any zoom.
    ctx.font = "600 8px var(--font-mono, monospace)";
    ctx.textAlign = "left";
    for (let km = 10; km <= 70; km += 10) {
      const sy = (DECK_Y - km * PX_PER_KM - camY) * cz;
      if (sy < RAIL + 20 || sy > H - RAIL - 24) continue;
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.moveTo(RAIL + 6, sy);
      ctx.lineTo(W - RAIL - 6, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = c.muted;
      ctx.fillText(`${km} KM`, RAIL + 10, sy - 3);
      ctx.globalAlpha = 1;
    }

    // Brass frame rails around the playfield.
    const rail = ctx.createLinearGradient(0, 0, 0, RAIL);
    rail.addColorStop(0, BRASS_HI);
    rail.addColorStop(0.5, BRASS_MID);
    rail.addColorStop(1, BRASS_EDGE);
    ctx.fillStyle = rail;
    ctx.fillRect(0, 0, W, RAIL);
    ctx.fillRect(0, H - RAIL, W, RAIL);
    ctx.fillRect(0, 0, RAIL, H);
    ctx.fillRect(W - RAIL, 0, RAIL, H);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(RAIL, RAIL, W - RAIL * 2, H - RAIL * 2);

    // Telemetry — fuel gauge on the left, velocities on the right.
    const gx = RAIL + 12;
    const gy = RAIL + 16;
    const gh = 90;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(gx, gy, 8, gh);
    const fuelH = (s.fuel / FUEL_MAX) * (gh - 4);
    ctx.fillStyle = s.fuel < 25 ? DANGER : c.accent;
    ctx.fillRect(gx + 2, gy + 2 + (gh - 4 - fuelH), 4, fuelH);
    ctx.strokeStyle = BRASS_LO;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, 8, gh);
    ctx.fillStyle = c.muted;
    ctx.font = "600 9px var(--font-mono, monospace)";
    ctx.textAlign = "left";
    ctx.fillText("FUEL", gx - 1, gy + gh + 12);

    if (s.phase === "descent" || s.phase === "settle") {
      const alt = Math.max(0, DECK_Y - (s.y + HH));
      // Speed warnings only matter on final approach, not at Mach 6.
      const low = alt < 1500;
      ctx.font = "600 11px var(--font-mono, monospace)";
      ctx.textAlign = "right";
      const tx = W - RAIL - 12;
      ctx.fillStyle = c.muted;
      ctx.fillText(`ALT ${(alt / PX_PER_KM).toFixed(1)}KM`, tx, RAIL + 26);
      ctx.fillStyle = !low || Math.abs(s.vy) <= VY_WARN ? c.muted : DANGER;
      ctx.fillText(
        `VSPD ${(Math.abs(s.vy) * DISP_MS).toFixed(0).padStart(4)}`,
        tx,
        RAIL + 42,
      );
      ctx.fillStyle = !low || Math.abs(s.vx) <= VX_WARN ? c.muted : DANGER;
      ctx.fillText(
        `HSPD ${(Math.abs(s.vx) * DISP_MS).toFixed(0).padStart(4)}`,
        tx,
        RAIL + 58,
      );
      ctx.fillStyle = Math.abs(s.ang) <= ANG_WARN ? c.muted : DANGER;
      ctx.fillText(
        `TILT ${Math.abs((s.ang * 180) / Math.PI).toFixed(0).padStart(3)}`,
        tx,
        RAIL + 74,
      );
      // Relights remaining — danger once the engine is out with none left.
      ctx.fillStyle = s.ign > 0 || s.lit ? c.muted : DANGER;
      ctx.fillText(`IGN  ${s.ign}`, tx, RAIL + 90);
      if (s.phase === "descent" && s.heat > 0.02) {
        ctx.fillStyle = s.heat > 0.5 ? DANGER : c.muted;
        ctx.fillText(`HEAT ${(s.heat * 100).toFixed(0).padStart(3)}`, tx, RAIL + 106);
      }
      if (s.phase === "settle") {
        ctx.fillStyle = c.accent;
        ctx.fillText("SETTLING", tx, RAIL + 106);
      }
    }

    // Radio chatter — phase callouts over the recovery net.
    if (s.callout) {
      ctx.fillStyle = c.muted;
      ctx.globalAlpha = 0.85;
      ctx.font = "600 9px var(--font-mono, monospace)";
      ctx.textAlign = "left";
      ctx.fillText(`▪ ${s.callout}`, RAIL + 12, H - RAIL - 10);
      ctx.globalAlpha = 1;
    }

    ctx.restore(); // camera shake
  }, []);

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();
    let running = true;
    let timeScale = 1;

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      // Slow-motion while the booster rocks itself out on the deck — the
      // settle is the best part, let it play out. A detonation also opens in
      // slow motion for a beat. Eases back to full speed.
      const s = g.current;
      const target =
        s.phase === "settle"
          ? 0.35
          : s.phase === "crashed" && s.crashTimer < 0.5
            ? 0.45
            : 1;
      timeScale += (target - timeScale) * Math.min(1, 6 * dt);
      const factor = canvas.width / widthRef.current;
      ctx.setTransform(factor, 0, 0, factor, 0, 0);
      step(dt * timeScale);
      draw(ctx);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [step, draw]);

  // Size the backing store to the wrapper (fluid width, fixed logical height)
  // and refresh theme colours.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const cssW = Math.max(280, wrap.clientWidth);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(H * dpr);
      widthRef.current = cssW;
      colorsRef.current = readColors(canvas);
      const s = g.current;
      s.x = Math.min(Math.max(s.x, WALL_L + HW), cssW - RAIL - 6 - HW);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const mo = new MutationObserver(() => {
      colorsRef.current = readColors(canvas);
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  // Keyboard: up/space burns, left/right gimbals.
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const s = g.current;
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W" || k === " ") s.thrust = down;
      else if (k === "ArrowLeft" || k === "a" || k === "A") s.left = down;
      else if (k === "ArrowRight" || k === "d" || k === "D") s.right = down;
      else return;
      if (s.phase === "descent") e.preventDefault();
    };
    const onDown = (e: KeyboardEvent) => set(e, true);
    const onUp = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Touch / pointer: hold the middle of the well to burn, the sides to gimbal.
  const applyZone = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const s = g.current;
    s.left = fx < 1 / 3;
    s.right = fx > 2 / 3;
    s.thrust = !s.left && !s.right;
  };

  const clearInput = () => {
    const s = g.current;
    s.thrust = false;
    s.left = false;
    s.right = false;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    applyZone(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    applyZone(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    clearInput();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  return (
    <div className="ng-stage">
      <div className="ng-hud">
        <span className="ng-hud__attempts">
          Attempt: <b>{attempts}</b>
        </span>
        {won ? (
          <button type="button" className="ng-hud__replay" onClick={restart}>
            Fly again
          </button>
        ) : (
          <span className="ng-hud__tip">
            {crashMsg ??
              "Entry burn before 40 km, land on one engine · ↑ / centre burns (3 relights) · ← → steer"}
          </span>
        )}
      </div>
      <div ref={wrapRef} className="ng-well">
        <canvas
          ref={canvasRef}
          className="ng-canvas"
          style={{ height: H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {won && (
          <div className="ng-win" role="status">
            <span className="ng-win__title">The booster has landed</span>
            <span className="ng-win__sub">
              Settled upright on attempt {attempts}. Recovery fleet en route.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
