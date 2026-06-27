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

## Stats model (Phase 2 follow-ups)

Notes from the Phase 2 build (richer stats model). The derive-from-attempts
aggregator lives in `src/engine/statsAggregator.ts`; the only writer is
`recomputeAllStats()` in `src/lib/statsStore.ts`.

- [ ] **Phase 3 — surface the new aggregates in the UI.** `getCategoryStats()`
      and `getSessionSummaries()` (in `statsStore.ts`) are written every recompute
      but have no consumers yet. Progress/home pages should chart subject /
      programme (NSAA vs ENGAA) / paper rollups, time-per-question, and the
      session-history trend.
- [x] **All-skipped sessions stay in the history series** — *decision: leave
      as-is.* A completed session where every attempt was skipped emits a
      `SessionSummary` with `attempts: 0, accuracy: 0`. This is a faithful record
      that the session happened and is consistent with the topic path (it
      contributes nothing to category/topic rollups). Not a bug; documenting the
      choice so it isn't "fixed" later by mistake.
- [ ] **Difficulty buckets — deferred, not implemented.** The plan listed a
      per-difficulty aggregate, but the source data has no difficulty and the
      loader never populates `Question.meta.difficulty` (every bucket would be
      "Unrated"). Add the dimension to `statsAggregator.ts` only once real
      difficulty data exists.
- [ ] **Abandoned / partial sessions are excluded from all stats.** Phase 1/2
      count `completed` sessions only (topics, categories, summaries alike).
      Revisit if we want abandoned-but-answered sessions to contribute now that a
      history series exists.
- [ ] **Nit: unused `categoryStats.by-accuracy` index.** `getCategoryStats()`
      sorts by `ewma_accuracy` in JS, so the `by-accuracy` index (db.ts) is
      currently dead — mirrors the existing `stats` store. Wire it up if/when a
      "weakest-first" indexed query is needed, or drop it.
