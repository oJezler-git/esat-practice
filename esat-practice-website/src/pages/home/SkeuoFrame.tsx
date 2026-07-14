import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * Skeuomorphic home frame with a hardware easter egg.
 *
 * The four corner screws are real, clickable hardware. Spam-click one and it
 * loosens turn by turn until it pops out and drops to the floor with gravity,
 * bouncing on the bottom of the viewport. Once only a single screw is left
 * holding the panel, the whole frame swings down about that screw like a
 * physical pendulum. Remove the last one and the panel drops off the screen —
 * then quietly reassembles itself so the page is never left broken.
 *
 * All of this is opt-in (nothing moves until you start unscrewing), so it stays
 * out of the way of the actual page.
 */

const CORNERS = ["tl", "tr", "bl", "br"] as const;
type Corner = (typeof CORNERS)[number];

const TURNS_TO_LOOSEN = 5; // clicks to fully back a screw out
const GRAVITY = 2600; // px/s^2 for loose screws and the falling panel
const RESTITUTION = 0.5; // floor/wall bounciness
const AIR = 0.999; // horizontal drag per frame while airborne
const PENDULUM_DAMP = 1.4; // panel swing damping

// Reassembly: strings reel the panel home, then screws fly back and spin in.
const REEL_K = 9; // panel reel-in spring stiffness (low = slow, gentle reel)
const REEL_C = 4.4; // panel reel-in damping
const RETURN_K = 130; // screw fly-home spring stiffness
const RETURN_C = 20; // screw fly-home damping
const RETURN_SPIN = 26; // rad/s screwing speed on the way in
const REASSEMBLE_DELAY = 320; // ms the panel stays gone before it's reeled back
const STRING_SLIDE = 2.2; // per-second rate the strings slide in/out of view

interface ScrewBody {
  corner: Corner;
  size: number;
  x: number; // viewport-fixed top-left
  y: number;
  vx: number;
  vy: number;
  rot: number; // radians
  vrot: number;
  resting: boolean;
  // While reassembling, the screw flies home and spins itself back in.
  returning: boolean;
  targetX: number;
  targetY: number;
}

type PanelPhase = "attached" | "swinging" | "falling" | "gone" | "reassembling";

interface PanelMotion {
  phase: PanelPhase;
  theta: number; // rotation about the pivot, radians
  omega: number;
  pivotX: number; // pivot offset within the frame's border box
  pivotY: number;
  comX: number; // centre-of-mass offset within the frame
  comY: number;
  fallY: number; // extra vertical drop once detached
  fallVy: number;
  homeReached: boolean; // panel reeled back into place, screws may seat
}

// Outward (away from centre) unit direction for each corner, used for the
// little "backing out" nudge as a screw loosens.
const OUTWARD: Record<Corner, [number, number]> = {
  tl: [-0.7, -0.7],
  tr: [0.7, -0.7],
  bl: [-0.7, 0.7],
  br: [0.7, 0.7],
};

export function SkeuoFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const screwRefs = useRef<Record<Corner, HTMLButtonElement | null>>({
    tl: null,
    tr: null,
    bl: null,
    br: null,
  });

  // Per-screw loosen progress (0 = tight). React state so the screws re-render.
  // Refs are the source of truth (so rapid clicks and StrictMode double-invoked
  // updaters can't miscount); state mirrors them purely for rendering.
  const turnsRef = useRef<Record<Corner, number>>({ tl: 0, tr: 0, bl: 0, br: 0 });
  const detachedRef = useRef<Record<Corner, boolean>>({ tl: false, tr: false, bl: false, br: false });
  const [turns, setTurns] = useState<Record<Corner, number>>({ tl: 0, tr: 0, bl: 0, br: 0 });
  const [detached, setDetached] = useState<Record<Corner, boolean>>({
    tl: false,
    tr: false,
    bl: false,
    br: false,
  });

  // Physics lives in refs; a frame counter forces re-renders during animation.
  const bodiesRef = useRef<ScrewBody[]>([]);
  const panelRef = useRef<PanelMotion>({
    phase: "attached",
    theta: 0,
    omega: 0,
    pivotX: 0,
    pivotY: 0,
    comX: 0,
    comY: 0,
    fallY: 0,
    fallVy: 0,
    homeReached: false,
  });
  // How far the marionette strings have slid into view (0 = tucked up at the
  // ceiling, 1 = fully lowered to the panel). Animated so they don't just pop.
  const stringRef = useRef(0);
  const [, forceRender] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const tick = useCallback(() => forceRender((n) => (n + 1) & 0xffff), []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
  }, []);

  const step = useCallback(
    (ts: number) => {
      const dt = lastTsRef.current === null ? 0 : Math.min((ts - lastTsRef.current) / 1000, 1 / 30);
      lastTsRef.current = ts;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let active = false;

      // --- loose screws ---
      const seated: number[] = [];
      bodiesRef.current.forEach((body, idx) => {
        if (body.returning) {
          // Spring the screw back to its slot, spinning as it threads in.
          active = true;
          body.vx += (RETURN_K * (body.targetX - body.x) - RETURN_C * body.vx) * dt;
          body.vy += (RETURN_K * (body.targetY - body.y) - RETURN_C * body.vy) * dt;
          body.x += body.vx * dt;
          body.y += body.vy * dt;
          body.rot += RETURN_SPIN * dt;
          const dx = body.targetX - body.x;
          const dy = body.targetY - body.y;
          if (dx * dx + dy * dy < 9 && body.vx * body.vx + body.vy * body.vy < 2500) {
            seated.push(idx);
          }
          return;
        }
        if (body.resting) return;
        active = true;
        body.vy += GRAVITY * dt;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.rot += body.vrot * dt;
        body.vx *= AIR;

        const floor = vh - body.size;
        if (body.y >= floor) {
          body.y = floor;
          body.vy = -body.vy * RESTITUTION;
          body.vx *= 0.7;
          body.vrot *= 0.6;
          if (Math.abs(body.vy) < 60) {
            body.vy = 0;
            if (Math.abs(body.vx) < 6) {
              body.vx = 0;
              body.vrot = 0;
              body.resting = true;
            }
          }
        }
        if (body.x <= 0) {
          body.x = 0;
          body.vx = -body.vx * RESTITUTION;
        } else if (body.x >= vw - body.size) {
          body.x = vw - body.size;
          body.vx = -body.vx * RESTITUTION;
        }
      });

      // A screw that reached its slot pops back into the panel as real hardware.
      if (seated.length > 0) {
        for (let i = seated.length - 1; i >= 0; i--) {
          const body = bodiesRef.current[seated[i]];
          detachedRef.current[body.corner] = false;
          turnsRef.current[body.corner] = 0;
          bodiesRef.current.splice(seated[i], 1);
        }
        setDetached({ ...detachedRef.current });
        setTurns({ ...turnsRef.current });
      }

      // --- panel ---
      const panel = panelRef.current;
      if (panel.phase === "swinging" || panel.phase === "falling") {
        active = true;
        const frame = frameRef.current;
        const w = frame?.offsetWidth ?? 1;
        const h = frame?.offsetHeight ?? 1;
        // Centre-of-mass offset from the pivot, rotated by the current angle.
        const r0x = panel.comX - panel.pivotX;
        const r0y = panel.comY - panel.pivotY;
        const c = Math.cos(panel.theta);
        const s = Math.sin(panel.theta);
        const rx = c * r0x - s * r0y;
        // Physical-pendulum: alpha = 3*g*rx / (w^2 + h^2), damped.
        const alpha = (3 * GRAVITY * rx) / (w * w + h * h) - PENDULUM_DAMP * panel.omega;
        panel.omega += alpha * dt;
        panel.theta += panel.omega * dt;

        if (panel.phase === "falling") {
          panel.fallVy += GRAVITY * dt;
          panel.fallY += panel.fallVy * dt;
          const frameTop = frame?.getBoundingClientRect().top ?? 0;
          if (frameTop > vh + 200) {
            panel.phase = "gone";
            if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
            resetTimerRef.current = window.setTimeout(
              () => startReassembleRef.current(),
              REASSEMBLE_DELAY,
            );
          }
        } else if (Math.abs(panel.omega) < 0.03 && Math.abs(rx) < 1.5) {
          // Settled, hanging from its one screw — hold the pose, stop animating.
          panel.omega = 0;
        }
      } else if (panel.phase === "reassembling") {
        active = true;
        // Strings reel the panel back to its home transform (fallY, theta → 0).
        panel.fallVy += (-REEL_K * panel.fallY - REEL_C * panel.fallVy) * dt;
        panel.fallY += panel.fallVy * dt;
        panel.omega += (-REEL_K * panel.theta - REEL_C * panel.omega) * dt;
        panel.theta += panel.omega * dt;

        if (
          !panel.homeReached &&
          Math.abs(panel.fallY) < 2 &&
          Math.abs(panel.fallVy) < 30 &&
          Math.abs(panel.theta) < 0.02
        ) {
          // Panel is home — release the strings and send the screws back up.
          panel.homeReached = true;
          panel.fallY = 0;
          panel.fallVy = 0;
          panel.theta = 0;
          panel.omega = 0;
          for (const body of bodiesRef.current) {
            const el = screwRefs.current[body.corner];
            if (el) {
              const r = el.getBoundingClientRect();
              body.targetX = r.left;
              body.targetY = r.top;
            }
            body.returning = true;
            body.resting = false;
            body.vy = -140; // lift off the floor first
          }
        }

        if (panel.homeReached && bodiesRef.current.length === 0) {
          panel.phase = "attached"; // whole again
        }
      }

      // Slide the strings down while the panel is being reeled, back up after.
      const stringTarget = panel.phase === "reassembling" && !panel.homeReached ? 1 : 0;
      if (stringRef.current !== stringTarget) {
        active = true;
        const stepAmt = STRING_SLIDE * dt;
        stringRef.current =
          stringRef.current < stringTarget
            ? Math.min(stringTarget, stringRef.current + stepAmt)
            : Math.max(stringTarget, stringRef.current - stepAmt);
      }

      if (active) {
        tick();
        rafRef.current = requestAnimationFrame(step);
      } else {
        tick();
        stopLoop();
      }
    },
    [stopLoop, tick],
  );

  const ensureLoop = useCallback(() => {
    if (rafRef.current === null) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(step);
    }
  }, [step]);

  // After the panel has dropped off-screen, reel it back on strings and let the
  // screws thread themselves in, rather than snapping everything back at once.
  const startReassemble = useCallback(() => {
    const panel = panelRef.current;
    if (panel.phase !== "gone") return;
    // Unwrap the accumulated spin so the strings reel via the short way round.
    panel.theta = Math.atan2(Math.sin(panel.theta), Math.cos(panel.theta));
    panel.omega = 0;
    panel.fallVy = 0;
    panel.homeReached = false;
    panel.phase = "reassembling";
    ensureLoop();
  }, [ensureLoop]);
  // startReassemble is fired from step (via timeout) — keep a stable ref.
  const startReassembleRef = useRef(startReassemble);
  useLayoutEffect(() => {
    startReassembleRef.current = startReassemble;
  }, [startReassemble]);

  const detachScrew = useCallback(
    (corner: Corner) => {
      const el = screwRefs.current[corner];
      const frame = frameRef.current;
      if (!el || !frame) return;
      const rect = el.getBoundingClientRect();

      // Spawn a free body where the screw currently sits.
      const [ox] = OUTWARD[corner];
      bodiesRef.current.push({
        corner,
        size: rect.width,
        x: rect.left,
        y: rect.top,
        vx: ox * 120 + (Math.random() - 0.5) * 160,
        vy: -220 - Math.random() * 160,
        rot: 0,
        vrot: (Math.random() - 0.5) * 18,
        resting: false,
        returning: false,
        targetX: 0,
        targetY: 0,
      });

      detachedRef.current[corner] = true;
      setDetached({ ...detachedRef.current });

      const remaining = CORNERS.filter((c) => !detachedRef.current[c]);
      const panel = panelRef.current;
      if (remaining.length === 1) {
        // Down to one screw — start swinging about it.
        const pivot = screwRefs.current[remaining[0]];
        if (pivot) {
          panel.phase = "swinging";
          panel.theta = 0;
          panel.omega = 0;
          panel.pivotX = pivot.offsetLeft + pivot.offsetWidth / 2;
          panel.pivotY = pivot.offsetTop + pivot.offsetHeight / 2;
          panel.comX = frame.offsetWidth / 2;
          panel.comY = frame.offsetHeight / 2;
        }
      } else if (remaining.length === 0 && panel.phase === "swinging") {
        // Last screw gone — the whole panel drops off.
        panel.phase = "falling";
        panel.fallY = 0;
        panel.fallVy = panel.omega === 0 ? 40 : 0;
      }

      ensureLoop();
    },
    [ensureLoop],
  );

  const turnScrew = useCallback(
    (corner: Corner) => {
      if (detachedRef.current[corner]) return;
      // Side effects stay out of the state updater so StrictMode's double
      // invocation can't spawn a screw twice.
      const next = turnsRef.current[corner] + 1;
      turnsRef.current[corner] = next;
      if (next >= TURNS_TO_LOOSEN) {
        detachScrew(corner);
      } else {
        setTurns({ ...turnsRef.current });
      }
    },
    [detachScrew],
  );

  useEffect(() => {
    return () => {
      stopLoop();
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, [stopLoop]);

  // --- render ---
  const panel = panelRef.current;
  const translated =
    panel.phase === "falling" || panel.phase === "gone" || panel.phase === "reassembling";
  const animating = panel.phase === "swinging" || translated;
  const panelStyle: React.CSSProperties = animating
    ? {
        transformOrigin: `${panel.pivotX}px ${panel.pivotY}px`,
        transform: translated
          ? `translateY(${panel.fallY}px) rotate(${panel.theta}rad)`
          : `rotate(${panel.theta}rad)`,
        zIndex: 40,
        willChange: "transform",
      }
    : {};

  // Strings that reel the panel back up. They slide down from the ceiling to the
  // top screw holes as they come in, and retract back up as they leave.
  const CEILING_Y = -8;
  const stringProgress = stringRef.current;
  const stringAnchors: Array<{ x: number; y2: number }> = [];
  if (stringProgress > 0.001) {
    for (const corner of ["tl", "tr"] as const) {
      const el = screwRefs.current[corner];
      if (el) {
        const r = el.getBoundingClientRect();
        const anchorY = r.top + r.height / 2;
        stringAnchors.push({
          x: r.left + r.width / 2,
          y2: CEILING_Y + (anchorY - CEILING_Y) * stringProgress,
        });
      }
    }
  }

  return (
    <>
      <div className="sk-frame" ref={frameRef} style={panelStyle}>
        {CORNERS.map((corner) => {
          const t = turns[corner];
          const [ox, oy] = OUTWARD[corner];
          const nudge = t * 1.4;
          const style: React.CSSProperties = {
            transform: `translate(${ox * nudge}px, ${oy * nudge}px) rotate(${t * 80}deg) scale(${1 + t * 0.03})`,
            opacity: detached[corner] ? 0 : 1,
            pointerEvents: detached[corner] ? "none" : "auto",
          };
          return (
            <button
              key={corner}
              type="button"
              ref={(el) => {
                screwRefs.current[corner] = el;
              }}
              className={`sk-screw sk-screw--${corner}${t > 0 ? " sk-screw--loose" : ""}`}
              style={style}
              onClick={() => turnScrew(corner)}
              aria-label="Loose panel screw"
              tabIndex={-1}
            />
          );
        })}
        {children}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <div className="sk-screw-floor" aria-hidden="true">
            {stringAnchors.length > 0 && (
              <svg className="sk-strings" width="100%" height="100%">
                {stringAnchors.map((a, i) => (
                  <line key={i} className="sk-string" x1={a.x} y1={CEILING_Y} x2={a.x} y2={a.y2} />
                ))}
              </svg>
            )}
            {bodiesRef.current.map((body, i) => (
              <span
                key={i}
                className="sk-screw sk-screw--body"
                style={{
                  left: body.x,
                  top: body.y,
                  width: body.size,
                  height: body.size,
                  transform: `rotate(${body.rot}rad)`,
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
