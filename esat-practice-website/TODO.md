# TODO — QOL / UI / UX / Microinteractions

Backlog of polish ideas for the source-scan drawing layer and session flow.
Ordered roughly by value-to-effort. Nothing here is started yet.

## Drawing layer (highest leverage)

- [ ] **Brush cursor preview** — small circle tracking the pointer at the current
      stroke width + colour before drawing (replaces the generic crosshair so you
      can gauge thickness before committing a stroke).
- [ ] **Eraser hover highlight** — dim/outline the stroke under the eraser so you
      see what you'll remove before tapping (strokes are already keyed by
      `data-ann-id`).
- [ ] **Shift-to-constrain shapes** — hold Shift for a perfectly straight line,
      square, or circle (small tweak in the shape pointer-move math).
- [ ] **Tool keyboard shortcuts (desktop)** — `P` pen, `H` highlighter, `E`
      eraser, `T` text, `V`/`Esc` pan, `[` / `]` width. Extend the existing
      keydown effect.
- [ ] **Remember last colour/width across reloads** — persist to `settingsStore`
      (or a small localStorage key) so a student's preferred ink survives reload.
- [ ] **Mobile haptics** — `navigator.vibrate(10)` on tool toggle / clear-confirm.
- [ ] **First-open hint** — one-time dismissible "Tip: tap the pen to annotate"
      so the feature is discoverable.

## Broader session UX

- [ ] **Double-tap / double-click to reset zoom** on the scan.
- [ ] **Subtle "saved ✓" pulse** when annotations persist.
- [ ] **Toolbar fade/slide-in** on open (reuse `--motion-*` tokens + reduced-motion
      handling).
