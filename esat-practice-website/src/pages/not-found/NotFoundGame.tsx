import { useCallback, useEffect, useRef, useState } from "react";

/*
 * "Escape the 404" — a small brass slingshot toy that lives inside the 404
 * panel. The big 404 is the playfield: the middle 0 is a portal home, the two
 * 4s are etched into the back wall, and the corner cannon flings a probe past a
 * field of screw-head pegs (the same hardware motif as the frame). Sink the
 * probe through the 0 to win.
 *
 * The field is FLUID — it fills whatever width the frame gives it. Rather than
 * scaling the whole scene up (which makes a huge portal), we keep every element
 * at a fixed pixel size and just add play area, then scale the physics with the
 * width (BASE_W reference) so the difficulty is identical at any width.
 *
 * All physics lives in refs and runs off requestAnimationFrame; React state is
 * only used for what the surrounding UI reacts to. Colours are read from the
 * live --sk-* tokens so the scene flips with the theme.
 */

// Fixed logical height; width is dynamic (= the well's CSS width).
const H = 400;
const BASE_W = 500; // width the physics was tuned at; everything scales off this

const RAIL = 16; // brass frame thickness
const FLOOR = H - RAIL - 6;
const WALL_L = RAIL + 6;
const CEIL = RAIL + 6;

const BALL_R = 9;
const PEG_R = 10;
const GRAVITY = 1020; // logical px / s^2 at BASE_W
const WALL_REST = 0.6;
const PEG_REST = 0.78;
const LAUNCH_K = 5.4; // drag px -> launch speed at BASE_W
const MAX_SPEED = 940; // at BASE_W
const MAX_DRAG = 150; // comfortable pull distance in screen px (width-independent)

// Brass hardware palette — reads well against both the dark and light wells.
const BRASS_HI = "#f0d38a";
const BRASS_MID = "#c69a45";
const BRASS_LO = "#7c5a22";
const BRASS_EDGE = "#4a3616";

type Vec = { x: number; y: number };
type Phase = "aim" | "flight" | "won";

interface Layout {
  w: number;
  wallR: number;
  goal: { x: number; y: number; outer: number; hole: number };
  cannon: Vec;
  pegs: Vec[];
  gravity: number;
  maxSpeed: number;
  launchK: number;
}

// Portal + guard pegs sit at fixed offsets from centre so the hard part (the
// threading) is identical at any width; the outer pegs spread with the field.
function computeLayout(w: number): Layout {
  const k = w / BASE_W;
  return {
    w,
    wallR: w - RAIL - 6,
    goal: { x: w / 2, y: 92, outer: 30, hole: 17 },
    cannon: { x: Math.max(46, w * 0.12), y: FLOOR - 16 },
    pegs: [
      { x: w / 2 - 46, y: 150 },
      { x: w / 2 + 46, y: 150 },
      { x: w / 2, y: 178 },
      { x: w * 0.28, y: 244 },
      { x: w * 0.72, y: 244 },
      { x: w * 0.5, y: 300 },
      { x: w * 0.16, y: 330 },
      { x: w * 0.84, y: 330 },
    ],
    gravity: GRAVITY * k,
    maxSpeed: MAX_SPEED * k,
    launchK: LAUNCH_K * k,
  };
}

interface GameRefs {
  phase: Phase;
  ball: Vec;
  vel: Vec;
  dragging: boolean;
  pointer: Vec;
  restTimer: number;
  flightTime: number;
  winSpin: number;
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

function reflect(vel: Vec, nx: number, ny: number, rest: number) {
  const dot = vel.x * nx + vel.y * ny;
  vel.x -= (1 + rest) * dot * nx;
  vel.y -= (1 + rest) * dot * ny;
}

interface Props {
  onWin: () => void;
}

export default function NotFoundGame({ onWin }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const colorsRef = useRef({ accent: "#e9bd63", text: "#f1e6cc", muted: "#a89a82" });
  const layoutRef = useRef<Layout>(computeLayout(BASE_W));
  const onWinRef = useRef(onWin);
  onWinRef.current = onWin;

  const [attempts, setAttempts] = useState(0);
  const [aiming, setAiming] = useState(false);
  const [won, setWon] = useState(false);

  const g = useRef<GameRefs>({
    phase: "aim",
    ball: { ...layoutRef.current.cannon },
    vel: { x: 0, y: 0 },
    dragging: false,
    pointer: { ...layoutRef.current.cannon },
    restTimer: 0,
    flightTime: 0,
    winSpin: 0,
  });

  const resetBall = useCallback(() => {
    const s = g.current;
    s.phase = "aim";
    s.ball = { ...layoutRef.current.cannon };
    s.vel = { x: 0, y: 0 };
    s.restTimer = 0;
    s.flightTime = 0;
  }, []);

  const restart = useCallback(() => {
    setWon(false);
    setAttempts(0);
    g.current.winSpin = 0;
    resetBall();
  }, [resetBall]);

  // Physics step (dt supplied by the RAF loop).
  const step = useCallback(
    (dt: number) => {
      const s = g.current;
      const L = layoutRef.current;
      if (s.phase !== "flight") return;

      s.flightTime += dt;
      s.vel.y += L.gravity * dt;

      // Sub-step to keep fast shots from tunnelling through pegs.
      const speed = Math.hypot(s.vel.x, s.vel.y);
      const subs = Math.min(6, 1 + Math.floor((speed * dt) / (PEG_R * 0.6)));
      const h = dt / subs;

      for (let i = 0; i < subs; i++) {
        s.ball.x += s.vel.x * h;
        s.ball.y += s.vel.y * h;

        if (s.ball.x - BALL_R < WALL_L) {
          s.ball.x = WALL_L + BALL_R;
          reflect(s.vel, 1, 0, WALL_REST);
        } else if (s.ball.x + BALL_R > L.wallR) {
          s.ball.x = L.wallR - BALL_R;
          reflect(s.vel, -1, 0, WALL_REST);
        }
        if (s.ball.y - BALL_R < CEIL) {
          s.ball.y = CEIL + BALL_R;
          reflect(s.vel, 0, 1, WALL_REST);
        } else if (s.ball.y + BALL_R > FLOOR) {
          s.ball.y = FLOOR - BALL_R;
          reflect(s.vel, 0, -1, WALL_REST);
          s.vel.x *= 0.86; // ground friction
        }

        for (const p of L.pegs) {
          const dx = s.ball.x - p.x;
          const dy = s.ball.y - p.y;
          const d = Math.hypot(dx, dy);
          const min = BALL_R + PEG_R;
          if (d < min && d > 0.0001) {
            const nx = dx / d;
            const ny = dy / d;
            s.ball.x = p.x + nx * min;
            s.ball.y = p.y + ny * min;
            reflect(s.vel, nx, ny, PEG_REST);
          }
        }

        // Portal home.
        const gd = Math.hypot(s.ball.x - L.goal.x, s.ball.y - L.goal.y);
        if (gd < L.goal.hole - BALL_R * 0.4) {
          s.phase = "won";
          s.ball = { x: L.goal.x, y: L.goal.y };
          s.vel = { x: 0, y: 0 };
          setWon(true);
          onWinRef.current();
          return;
        }
      }

      // Settle: once it's crawling along the floor, hand the cannon back.
      const spd = Math.hypot(s.vel.x, s.vel.y);
      if ((spd < 32 && s.ball.y + BALL_R > FLOOR - 2) || s.flightTime > 14) {
        s.restTimer += dt;
        if (s.restTimer > 0.35) resetBall();
      } else {
        s.restTimer = 0;
      }
    },
    [resetBall],
  );

  // Light-weight preview trajectory for the aiming dots.
  const previewPath = useCallback((v0: Vec): Vec[] => {
    const L = layoutRef.current;
    const pts: Vec[] = [];
    let x = L.cannon.x;
    let y = L.cannon.y;
    let vx = v0.x;
    let vy = v0.y;
    const dt = 1 / 60;
    for (let i = 0; i < 90; i++) {
      vy += L.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      if (x < WALL_L || x > L.wallR || y > FLOOR) break;
      let hitPeg = false;
      for (const p of L.pegs) {
        if (Math.hypot(x - p.x, y - p.y) < BALL_R + PEG_R) {
          hitPeg = true;
          break;
        }
      }
      if (hitPeg) break;
      if (i % 3 === 0) pts.push({ x, y });
    }
    return pts;
  }, []);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const s = g.current;
      const c = colorsRef.current;
      const L = layoutRef.current;
      const W = L.w;
      const goal = L.goal;
      ctx.clearRect(0, 0, W, H);

      // Table backdrop — a warm vignette so the well doesn't read as a void.
      const bg = ctx.createRadialGradient(W / 2, H * 0.32, 40, W / 2, H * 0.5, W * 0.8);
      bg.addColorStop(0, "rgba(70, 52, 26, 0.35)");
      bg.addColorStop(1, "rgba(0, 0, 0, 0.25)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Etched "4 0 4" backplate. Side 4s are engraved; the 0 is the portal.
      const digitGap = Math.min(128, W * 0.26);
      ctx.save();
      ctx.font = "700 118px var(--font-display, Georgia), serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillText("4", goal.x - digitGap, goal.y + 4);
      ctx.fillText("4", goal.x + digitGap, goal.y + 4);
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.strokeText("4", goal.x - digitGap, goal.y + 5);
      ctx.strokeText("4", goal.x + digitGap, goal.y + 5);
      ctx.restore();

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

      // Portal "0" — a recessed brass ring with a glowing throat.
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420);
      ctx.save();
      const glow = ctx.createRadialGradient(
        goal.x, goal.y, goal.hole * 0.2,
        goal.x, goal.y, goal.outer,
      );
      glow.addColorStop(0, c.accent);
      glow.addColorStop(0.55, "rgba(0,0,0,0.55)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.3 + 0.3 * pulse;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, goal.outer, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const ring = ctx.createLinearGradient(0, goal.y - goal.outer, 0, goal.y + goal.outer);
      ring.addColorStop(0, BRASS_HI);
      ring.addColorStop(0.5, BRASS_MID);
      ring.addColorStop(1, BRASS_LO);
      ctx.lineWidth = goal.outer - goal.hole;
      ctx.strokeStyle = ring;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, (goal.outer + goal.hole) / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, goal.hole + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, goal.outer - 1, 0, Math.PI * 2);
      ctx.stroke();

      const throat = ctx.createRadialGradient(goal.x, goal.y, 2, goal.x, goal.y, goal.hole);
      throat.addColorStop(0, s.phase === "won" ? c.accent : "rgba(0,0,0,0.85)");
      throat.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = throat;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, goal.hole, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Screw-head pegs — the frame's hardware, dropped into the field.
      for (const p of L.pegs) {
        const pg = ctx.createRadialGradient(
          p.x - PEG_R * 0.35, p.y - PEG_R * 0.35, 1, p.x, p.y, PEG_R,
        );
        pg.addColorStop(0, BRASS_HI);
        pg.addColorStop(0.6, BRASS_MID);
        pg.addColorStop(1, BRASS_EDGE);
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x - PEG_R * 0.55, p.y - PEG_R * 0.42);
        ctx.lineTo(p.x + PEG_R * 0.55, p.y + PEG_R * 0.42);
        ctx.stroke();
      }

      // Cannon base.
      ctx.save();
      const base = ctx.createLinearGradient(0, L.cannon.y, 0, L.cannon.y + 40);
      base.addColorStop(0, BRASS_MID);
      base.addColorStop(1, BRASS_EDGE);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(L.cannon.x, L.cannon.y + 18, 22, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.stroke();
      ctx.restore();

      // Aiming: slingshot band + trajectory preview.
      if (s.phase === "aim" && s.dragging) {
        const dx = L.cannon.x - s.pointer.x;
        const dy = L.cannon.y - s.pointer.y;
        const dist = Math.min(MAX_DRAG, Math.hypot(dx, dy));
        const ang = Math.atan2(dy, dx);
        const vx = Math.cos(ang) * dist;
        const vy = Math.sin(ang) * dist;
        const speed = Math.min(L.maxSpeed, dist * L.launchK);
        const v0 = { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed };

        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(L.cannon.x - vx, L.cannon.y - vy);
        ctx.lineTo(L.cannon.x, L.cannon.y);
        ctx.stroke();
        ctx.globalAlpha = 1;

        const pts = previewPath(v0);
        ctx.fillStyle = c.muted;
        for (let i = 0; i < pts.length; i++) {
          ctx.globalAlpha = 0.7 * (1 - i / pts.length);
          ctx.beginPath();
          ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        const pct = Math.round((dist / MAX_DRAG) * 100);
        ctx.fillStyle = c.muted;
        ctx.font = "600 13px var(--font-mono, monospace)";
        ctx.textAlign = "left";
        ctx.fillText(`PWR ${pct}%`, L.cannon.x + 30, L.cannon.y - 10);
      }

      // Probe.
      if (s.phase !== "won") {
        const b = s.ball;
        const bgrad = ctx.createRadialGradient(
          b.x - BALL_R * 0.4, b.y - BALL_R * 0.4, 1, b.x, b.y, BALL_R,
        );
        bgrad.addColorStop(0, "#fff4d6");
        bgrad.addColorStop(0.5, c.accent);
        bgrad.addColorStop(1, BRASS_LO);
        ctx.fillStyle = bgrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        s.winSpin += 0.05;
        ctx.save();
        ctx.translate(goal.x, goal.y);
        ctx.rotate(s.winSpin);
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          ctx.rotate((Math.PI * 2) / 8);
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.moveTo(goal.hole + 6, 0);
          ctx.lineTo(goal.hole + 22, 0);
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    },
    [previewPath],
  );

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();
    let running = true;

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const factor = canvas.width / layoutRef.current.w;
      ctx.setTransform(factor, 0, 0, factor, 0, 0);
      step(dt);
      draw(ctx);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [step, draw]);

  // Size the backing store to the wrapper (fluid width, fixed logical height),
  // recompute the width-dependent layout, and refresh theme colours.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const cssW = Math.max(280, wrap.clientWidth);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(H * dpr);
      layoutRef.current = computeLayout(cssW);
      colorsRef.current = readColors(canvas);
      if (g.current.phase === "aim") {
        g.current.ball = { ...layoutRef.current.cannon };
      }
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

  const toLogical = (clientX: number, clientY: number): Vec => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * layoutRef.current.w,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = g.current;
    if (s.phase !== "aim") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    s.dragging = true;
    s.pointer = toLogical(e.clientX, e.clientY);
    setAiming(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s.dragging) return;
    s.pointer = toLogical(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = g.current;
    const L = layoutRef.current;
    if (!s.dragging) return;
    s.dragging = false;
    setAiming(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }

    const dx = L.cannon.x - s.pointer.x;
    const dy = L.cannon.y - s.pointer.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) return; // a tap, not a pull
    const ang = Math.atan2(dy, dx);
    const speed = Math.min(L.maxSpeed, Math.min(MAX_DRAG, dist) * L.launchK);
    s.vel = { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed };
    s.phase = "flight";
    s.flightTime = 0;
    s.restTimer = 0;
    setAttempts((n) => n + 1);
  };

  return (
    <div className="ng-stage">
      <div className="ng-hud">
        <span className="ng-hud__attempts">
          Shots: <b>{attempts}</b>
        </span>
        {won ? (
          <button type="button" className="ng-hud__replay" onClick={restart}>
            Play again
          </button>
        ) : (
          <span className="ng-hud__tip">
            {aiming ? "Release to launch" : "Drag back from the cannon to aim"}
          </span>
        )}
      </div>
      <div ref={wrapRef} className="ng-well">
        <canvas
          ref={canvasRef}
          className="ng-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {won && (
          <div className="ng-win" role="status">
            <span className="ng-win__title">Portal reached</span>
            <span className="ng-win__sub">
              You found your way home in {attempts} shot{attempts === 1 ? "" : "s"}.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
