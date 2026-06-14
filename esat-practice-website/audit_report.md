# Performance & Data Loading Audit

**Codebase:** esat-practice-website (React 19 + TypeScript + Vite 8 + Zustand + idb)  
**Audited:** 2026-06-13  
**Scope:** JSON loading correctness, state management patterns, rendering performance, bundle strategy, missing infrastructure

---

## Summary

The codebase has a thoughtful architecture: JSON packs are served statically from `public/data/`, fetched at runtime via `fetch()`, and persisted to IndexedDB — so no JSON ever enters the Vite bundle directly (other than one 1.6 KB sample file). The service worker, dedupe logic, and virtual-scroll implementation in the question-bank page all show intentional engineering. However, there are several significant issues that will cause real degradation at the current data scale (16 JSON packs, ~63 MB raw, an estimated **1,000–2,000 questions** post-normalisation):

- The entire question corpus is held as a flat `Question[]` array in a Zustand store, and every consumer immediately does full-array passes on each render cycle.
- The JSON pack files are enormous (3.7 MB – 5.9 MB **each**) primarily because each question record embeds its image as a raw `data:image/jpeg;base64,...` string directly in the JSON. The build script copies source files verbatim rather than extracting images to separate static assets, so the browser downloads, parses, and holds in memory every image for every question simultaneously — regardless of whether those questions are ever rendered.
- `App.tsx` has zero code-splitting: all eight page modules are statically imported at startup.
- The virtual-scroll implementation in the question-bank page has logical gaps that can cause it to fall back to a full, unbounded DOM render.
- No `AbortController` is used for any in-flight fetch.
- The service worker's `"esat-v1"` cache does not cover the `data/` packs at all at install time, and the data-state localStorage key persists "pack already loaded" across manifest version changes in a way that can cause silent stale data.

---

## Critical Issues

---

### C-01 · Base64 images embedded in JSON pack files instead of served as separate static assets

- **File:** `scripts/build-question-data.ts`
- **Location:** `buildPackManifestEntry()`, lines 132–176
- **Issue:** The build script copies source JSON files into `public/data/packs/` with `cp()` verbatim. Each question record in the source files contains its image as a `data:image/jpeg;base64,...` string in the `image` field. Because no extraction step runs at build time, the browser receives entire pack files where the vast majority of bytes are base64-encoded image data bundled alongside every question simultaneously. Secondary waste: `classification.question_text` is a verbatim duplicate of the top-level `text` field, and `classification.question_id` duplicates `id` — adding redundant bytes to every record that has a classification block.
- **Impact:** Pack files are 3.7–5.9 MB each (~63 MB total) almost entirely because of embedded base64 images. Base64 encoding inflates binary image size by ~33%, so a 150 KB JPEG becomes a ~200 KB JSON string value. The browser must download and `JSON.parse()` the entire file — including every image string — before a single question is displayable, blocking the main thread for the duration of the parse. Images are not independently browser-cacheable as `data:` URIs inside JSON. Every image is held in memory simultaneously in the parsed JSON object, then again in the `Question[]` in Zustand, then again written to IndexedDB — the same binary data duplicated three times in storage. A user who only ever views 10 questions has still downloaded and stored images for every question in the pack.
- **Fix:** Modify `build-question-data.ts` to replace the `cp()` call with a projection step that:
  1. Decodes each `image` base64 string and writes it as a static file at `public/data/images/{question_id}.jpg` (or `.webp` for an additional ~30% size reduction via `sharp`)
  2. Replaces the `image` field in the JSON record with `image_url: "/data/images/{question_id}.jpg"`
  3. Strips `classification.question_text` and `classification.question_id` (verbatim duplicates of `text` and `id`)
  4. Writes the projected JSON to `public/data/packs/` instead of the raw source file

  After this change, pack files should be **50–200 KB each** (question text and metadata only). Images become independently cacheable static assets fetched on demand when a question is rendered. `normalizePipelinePayload()` in `loader.ts` becomes a near-no-op. IDB stores a URL string per question instead of a 100–250 KB base64 blob.

- **Code:**

```ts
// build-question-data.ts L165
await cp(filePath, outputPath, { force: true }); // verbatim copy — base64 images and all
```

---

### C-02 · Entire question corpus loaded into Zustand memory as a flat array

- **File:** `src/lib/questionStore.ts`
- **Location:** `useQuestionStoreBase` store, line 65; `loadQuestions()`, lines 69–80
- **Issue:** `listQuestionsFromDb()` calls `database.getAll("questions")` — a full IndexedDB table scan — and stores the entire result as `questions: Question[]` in the Zustand store. With ~1,500 questions at roughly 1–2 KB each after normalisation this is 1.5–3 MB of live JavaScript objects in React state. Any write to this array causes every subscriber to receive a new reference.
- **Impact:** All derived computations (`getDedupedQuestions`, `effectiveExcludedIds`, `availableTopics`, `availableYears`, `filtered`, `dataDump`) iterate the full array. While they are individually memoised, they all fire together whenever `allQuestions` changes identity, which happens once on load but also every time `loadQuestions` is re-called. More importantly, the store holds every `image_b64` string (base-64 encoded PNG/JPEG) for every question that has an image — which can individually be tens of kilobytes — in a single flat array in memory.
- **Code:**

```ts
// questionStore.ts L72-76
const questions = await listQuestionsFromDb(); // full IDB getAll()
set({
  questions, // entire corpus in one Zustand state slot
  loaded: true,
});
```

---

### C-03 · `bootstrapQuestions` returns the full normalised array in its summary

- **File:** `src/lib/loader.ts`
- **Location:** `bootstrapQuestions()`, lines 459–488
- **Issue:** The return value of `bootstrapQuestions()` includes `questions: Question[]` (the full normalised pack), and `ensureQuestionPacksBootstrapped()` is called once per pack in a loop. The questions array is collected into a `LoaderSummary` but then immediately discarded by the caller (`ensureQuestionPacksBootstrapped` returns `questions: []` at line 595). Each pack's normalised array is allocated, passed up the call stack, and then GC'd — peaking the heap for every pack in sequence.
- **Impact:** During the initial load of 16 packs the process will allocate and discard 16 separate large `Question[]` arrays. If a pack has 100 questions at 2 KB each, that is 200 KB per pack × 16 = 3.2 MB of transient allocations on top of the IDB write overhead. The return shape is misleading and the allocation is pointless.
- **Code:**

```ts
// loader.ts L482-487
return {
  existing,
  inserted,
  skipped,
  questions, // full normalised array — caller discards it at L595
};
```

---

### C-04 · No `AbortController` on any `fetch()` call

- **File:** `src/lib/loader.ts`
- **Location:** `fetchJson()`, line 366; `loadPackPayload()`, line 530
- **Issue:** All `fetch()` calls are fire-and-forget with no cancellation signal. If the user navigates away mid-load, or if a manifest fetch hangs, the in-flight requests continue consuming bandwidth and the resolved promise will attempt to write to IndexedDB.
- **Impact:** On a slow connection, navigating away from the app while packs are loading (which happens on every first visit) will leave 1–5 large JSON fetches in flight. Each one will eventually resolve, re-open IDB, and write data — even though the component tree that triggered the load has been unmounted. This can cause "database closed" errors and wastes bandwidth on mobile. Because `bundledBootstrapPromise` caches the `Promise`, the request cannot even be re-triggered cleanly afterwards.
- **Code:**

```ts
// loader.ts L366-371
async function fetchJson(url: string, cacheMode: RequestCache): Promise<unknown> {
  const response = await fetch(url, { cache: cacheMode }); // no AbortSignal
  if (!response.ok) { ... }
  return response.json() as Promise<unknown>;
}
```

---

### C-05 · `getRecentSessions` performs a full IDB table scan without an index

- **File:** `src/lib/sessionStore.ts`
- **Location:** `getRecentSessions()`, lines 114–120
- **Issue:** `database.getAll("sessions")` retrieves every session record, then sorts in JS and slices to the limit. There is no IDB index on `created_at`.
- **Impact:** A user who has completed hundreds of sessions will pay the full serialisation cost of reading every session record from IDB into JS on every call to this function. The sort is O(n log n) in JavaScript rather than delegated to the database. Because session records include `attempt_ids` arrays that grow per session, old sessions with many attempts will be expensive to deserialise even though only 10 are ever shown.
- **Code:**

```ts
// sessionStore.ts L114-120
export async function getRecentSessions(
  limit: number = 10,
): Promise<Session[]> {
  const database = await getDb();
  const sessions = await database.getAll("sessions"); // full table scan
  return sessions
    .sort((left, right) => right.created_at - left.created_at) // JS sort
    .slice(0, limit);
}
```

---

## Moderate Issues

---

### M-01 · `pipeline-sample.json` is statically imported into the bundle

- **File:** `src/lib/loader.ts`
- **Location:** Line 1
- **Issue:** `import pipelineSample from "../data/pipeline-sample.json"` is a static ESM import. Vite will inline this JSON into the JS bundle at build time.
- **Impact:** While the sample file is only 1.6 KB, this sets a pattern that is dangerous if the file ever grows, and it means the JSON is parsed synchronously at module evaluation rather than on demand. It also ties the sample data's shape to the bundle hash, forcing a cache-bust on any sample change regardless of whether the user ever hits the fallback path.
- **Code:**

```ts
// loader.ts L1
import pipelineSample from "../data/pipeline-sample.json"; // bundled into main chunk
```

---

### M-02 · `App.tsx` has zero code-splitting; all pages are eagerly imported

- **File:** `src/App.tsx`
- **Location:** Lines 8–15
- **Issue:** All eight page components (`Home`, `PracticeSetup`, `SessionPage`, `ResultsPage`, `QuestionBank`, `Progress`, `Settings`, `NotFound`) are statically imported. None use `React.lazy()` / `Suspense`.
- **Impact:** The JS chunk for every page — including the 1,010-line `question-bank/index.tsx` with its virtualisation logic and dedup panel — is downloaded and evaluated on every initial page load regardless of which route the user visits. The question-bank page in particular is the largest page in the app and is rarely the entry point.
- **Code:**

```ts
// App.tsx L8-15
import Home from "./pages/home";
import PracticeSetup from "./pages/practice-setup";
import SessionPage from "./pages/session";
import ResultsPage from "./pages/results";
import QuestionBank from "./pages/question-bank";
import Progress from "./pages/progress";
import Settings from "./pages/settings";
import NotFound from "./pages/not-found";
```

---

### M-03 · `vite.config.ts` has no manual chunk splitting and no build optimisation

- **File:** `vite.config.ts`
- **Location:** Entire file (10 lines)
- **Issue:** The config contains only `plugins: [react()]` and `resolve: { preserveSymlinks: true }`. There is no `build.rollupOptions.output.manualChunks`, no `build.chunkSizeWarningLimit`, no `optimizeDeps`, and no asset strategy.
- **Impact:** Vite will produce a single monolithic vendor chunk (React, React Router, Zustand, idb, @vercel/analytics) and a single app chunk. There is no separation of the session engine (heavy logic) from the UI shell. When any dependency is updated the entire vendor chunk is cache-busted for all returning users.
- **Code:**

```ts
// vite.config.ts — full file
export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
});
```

---

### M-04 · `useQuestionStore` is called independently at every consumer, each adding its own `useEffect` to trigger loading

- **File:** `src/lib/questionStore.ts`
- **Location:** `useQuestionStore()`, lines 91–198
- **Issue:** `useQuestionStore` is a custom hook, not a singleton call. Each component that calls it independently subscribes to the base store and independently fires the `useEffect` on lines 105–109 that triggers `loadQuestions()`. The guard `!loaded && !isLoading` prevents duplicate loads only because of the shared Zustand state — but between the first and second component mounting (before `set({ isLoading: true })` has propagated), a race condition exists where two mounts could both pass the guard simultaneously.
- **Impact:** In a component tree where multiple components call `useQuestionStore()` simultaneously (e.g. on the question-bank page and a sidebar both mounting at once), there is a theoretical double-load race. More concretely, the `useMemo` computations inside `useQuestionStore` (`nsaaDuplicateAnalysis`, `effectiveExcludedIds`, `questions`, `fullPracticeBank`, `excludedQuestions`, `availableTopics`, `availableYears`) are run **once per consumer component instance**, not once globally. If five components call the hook, those memos execute five times.
- **Code:**

```ts
// questionStore.ts L105-109
useEffect(() => {
  if (!loaded && !isLoading) {
    void loadQuestions(); // race if two components mount before isLoading propagates
  }
}, [isLoading, loadQuestions, loaded]);
```

---

### M-05 · `analyseNsaaDuplicates` is computed twice for the same `allQuestions` array on the question-bank page

- **File:** `src/pages/question-bank/index.tsx` and `src/lib/questionStore.ts`
- **Location:** `questionStore.ts` lines 121–124; `question-bank/index.tsx` lines 74–77
- **Issue:** `analyseNsaaDuplicates(allQuestions)` is called inside `useQuestionStore` (via the `nsaaDuplicateAnalysis` memo) **and** independently inside `QuestionBank` (the `duplicateAnalysis` memo). Both are memoised on `allQuestions`, but they are different memo instances and the function is called twice.
- **Impact:** `analyseNsaaDuplicates` performs an O(n²) cross-product comparison of NSAA vs ENGAA questions (cosine-similarity-style text comparison). With ~500 NSAA and ~500 ENGAA questions this is ~250,000 comparisons, each involving string normalisation and character-frequency counting. Running this twice per `allQuestions` change doubles the cost of the most expensive computation in the app.
- **Code:**

```ts
// questionStore.ts L121-124
const nsaaDuplicateAnalysis = useMemo(
  () => analyseNsaaDuplicates(allQuestions), // run #1
  [allQuestions],
);

// question-bank/index.tsx L74-77
const duplicateAnalysis = useMemo(
  () => analyseNsaaDuplicates(allQuestions), // run #2 — same input, different memo
  [allQuestions],
);
```

---

### M-06 · `excludeCurrentQuestion` in `sessionSlice.ts` calls `analyseNsaaDuplicates` with `allQuestions` during an active session

- **File:** `src/store/sessionSlice.ts`
- **Location:** `excludeCurrentQuestion()`, lines 283–292
- **Issue:** When a question is excluded mid-session, `analyseNsaaDuplicates(allQuestions)` is called synchronously inside the async action handler, where `allQuestions` is the entire question corpus passed in as an argument.
- **Impact:** Every exclusion action during a session triggers the full O(n²) dedup analysis on the main thread, blocking the JS event loop during a time-critical user interaction (the user is mid-exam). The result is used only to propagate the exclusion to the paired duplicate — a much cheaper operation that could be done with a pre-built lookup map.
- **Code:**

```ts
// sessionSlice.ts L283-292
if (allQuestions) {
  const analysis = analyseNsaaDuplicates(allQuestions); // O(n²) on main thread, mid-session
  for (const pair of analysis.excludedPairs) {
    if (pair.engaaQuestion.id === question.id) {
      idsToExclude.push(pair.nsaaQuestion.id);
    } else if (pair.nsaaQuestion.id === question.id) {
      idsToExclude.push(pair.engaaQuestion.id);
    }
  }
}
```

---

### M-07 · `upsertAttemptRecord` uses `Array.includes()` to check for duplicate attempt IDs on every answer

- **File:** `src/lib/sessionStore.ts`
- **Location:** `upsertAttemptRecord()`, line 152
- **Issue:** Before appending an attempt ID to the session's `attempt_ids` array, the code runs `session.attempt_ids.includes(attempt.id)`. This is an O(n) linear scan of the array on every answer/flag/skip action.
- **Impact:** For a long session (e.g. 40-question timed practice), by question 40 the `attempt_ids` array has 39–120 entries (multiple events per question). The linear scan is benign at this scale but is the wrong data structure for this check. If session sizes grow or the check is called more frequently (e.g. autosave), it will be noticeable.
- **Code:**

```ts
// sessionStore.ts L152
if (session && !session.attempt_ids.includes(attempt.id)) { // O(n) on every mark/flag/skip
```

---

### M-08 · `dataManagement.clearAllData` / `clearProgressData` fire-and-forget IDB deletions inside a loop

- **File:** `src/lib/dataManagement.ts`
- **Location:** `clearAllData()`, lines 17–22; `clearProgressData()`, lines 36–41
- **Issue:** `indexedDB.deleteDatabase(db.name)` is called without `await` inside a `for` loop. The result is a pending `IDBOpenDBRequest` that is never awaited or error-handled.
- **Impact:** The `clearAllData` / `clearProgressData` functions return `Promise<void>` and callers likely `await` them, expecting the databases to be gone by the time the promise resolves. However, since the deletions are fire-and-forget, a caller that immediately re-opens the database might get the old data. Additionally, if deletion fails (e.g. the database is locked by another tab), the error is silently swallowed.
- **Code:**

```ts
// dataManagement.ts L17-22
const dbs = await indexedDB.databases();
for (const db of dbs) {
  if (db.name) {
    indexedDB.deleteDatabase(db.name); // no await, no error handling
  }
}
```

---

### M-09 · Virtual scroll implementation in `QuestionBank` is scroll-position-based but uses `window.scrollY`, not container scroll

- **File:** `src/pages/question-bank/index.tsx`
- **Location:** `syncWindowMetrics` inside `useEffect`, lines 186–215; virtual slice computation, lines 242–249
- **Issue:** The virtualisation logic tracks `window.scrollY` and computes a `scrollTop` relative to the list container's `getBoundingClientRect().top`. This is a manual approximation. The `totalHeight` is set to `Math.min(virtualCount, filtered.length) * VIRTUAL_ROW_HEIGHT + detailBlockHeight` (lines 239–241), where `virtualCount` starts at 80 (VIRTUAL_BATCH_SIZE) and grows by 80 as the user scrolls. This means only 80 items have their height represented in the DOM spacer initially.
- **Impact:** If a user jumps to the bottom of the list via keyboard or a direct URL anchor, or if the browser restores scroll position on back-navigation, the spacer height is 80 × 92 = 7,360 px regardless of how many items exist. Items beyond the 80th are not rendered AND not positioned correctly in the layout — the spacer ends abruptly. Rapid keyboard scrolling can outpace the `useEffect` batch expansion, leaving a blank gap at the bottom. The `dynamicTotalHeight` calculation is therefore incorrect for any list longer than the current `virtualCount`.
- **Code:**

```ts
// question-bank/index.tsx L239-241
const dynamicTotalHeight =
  Math.min(virtualCount, filtered.length) * VIRTUAL_ROW_HEIGHT +
  detailBlockHeight;
// ↑ Only accounts for rendered items, not the full list height
```

---

### M-10 · The `useMemo` dependency array in `useSessionEngine` contains a redundant duplicate

- **File:** `src/store/sessionSlice.ts`
- **Location:** `useSessionEngine()`, lines 466–505
- **Issue:** `questions` appears **twice** in the `useMemo` dependency array: at line 498 and again as `questions.length` at line 500. `questions.length` is a derived scalar from `questions`; if `questions` is already in the array, adding `questions.length` is redundant — when `questions` is a new reference, the memo already fires.
- **Impact:** Low — no correctness bug, but it signals that this dep array was assembled manually and may have other issues. It also means the memo fires even if `questions.length` is the same but `questions` reference is stable (which is the normal Zustand selector behaviour), though in practice Zustand returns a new array reference on any mutation.
- **Code:**

```ts
// sessionSlice.ts L487-505
[
  currentAttemptResult,
  currentIndex,
  currentQuestion,
  flag,
  excludeCurrentQuestion,
  isFlagged,
  load,
  mark,
  nav,
  jumpTo,
  questions,        // ← appears once here
  responses,
  questions.length, // ← and again here — redundant
  skip,
  status,
  submit,
  timeRemaining,
],
```

---

### M-11 · `getStyle()` inside `ChoiceGrid` is a plain function defined inside the render body, recreated on every render

- **File:** `src/components/question/ChoiceGrid.tsx`
- **Location:** `getStyle()`, lines 21–35
- **Issue:** `getStyle` is defined as a regular function inside the component body, not wrapped in `useCallback`. Each render creates a new function object. More importantly, it is called once per choice inside the JSX `.map()` (line 46), meaning 4–5 string operations per render.
- **Impact:** In isolation this is trivial. However, `ChoiceGrid` re-renders on every tick of the session timer (because the parent passes `selected` and `correct` as props derived from store state which the timer updates). String class concatenation for 4 choices × N re-renders/minute has a small but non-zero cost. The larger issue is that this is a sign the component is not stabilised: wrapping it in `React.memo` would be a no-op while the parent re-renders with new function references.
- **Code:**

```tsx
// ChoiceGrid.tsx L21-35
function getStyle(label: string) { // recreated every render
  if (!reviewMode) {
    return selected === label ? "border-indigo-500 ..." : "border-gray-200 ...";
  }
  ...
}
```

---

### M-12 · `manifest.json` is fetched with `cache: "no-store"` on every app start

- **File:** `src/lib/loader.ts`
- **Location:** `loadQuestionDataManifest()` → `fetchJson(...)`, lines 490–524
- **Issue:** The manifest is fetched with `"no-store"` cache mode, which bypasses both the HTTP cache and the service worker cache unconditionally. The module-level `questionDataManifestPromise` deduplicates within a single page lifetime but not across page loads.
- **Impact:** On every page load, a network round-trip is made to fetch `data/manifest.json` (13 KB). On slow connections this adds latency before any pack loading can begin. The manifest rarely changes (only when `npm run build` is re-run), so `"no-store"` is far more aggressive than needed — `"no-cache"` (revalidate, use cache if fresh) would be more appropriate, and the service worker's network-first strategy would handle cache on subsequent visits anyway.
- **Code:**

```ts
// loader.ts L494-497
const payload = await fetchJson(
  resolveDataUrl(QUESTION_DATA_MANIFEST_PATH),
  "no-store", // bypasses all caches, including service worker
);
```

---

## Minor Issues / Code Quality

---

### m-01 · `generateId()` is duplicated verbatim in `sessionStore.ts` and `sessionSlice.ts`

- **File:** `src/lib/sessionStore.ts` (line 10); `src/store/sessionSlice.ts` (line 27)
- **Issue:** Identical `generateId()` implementation in two files. Neither imports from a shared utility.
- **Code:**

```ts
// Identical in both files:
function generateId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
```

---

### m-02 · `normalizeResult()` is also duplicated in both files

- **File:** `src/lib/sessionStore.ts` (lines 17–28); `src/store/sessionSlice.ts` (lines 34–39)
- **Issue:** Two implementations of `normalizeResult()` with slightly different logic (the `sessionStore` version handles legacy `true`/`false` booleans; the `sessionSlice` version does not). This divergence could cause subtle inconsistencies if a session is loaded that has a legacy boolean `result` field.
- **Code:**

```ts
// sessionStore.ts L17-28 — handles boolean legacy values:
function normalizeResult(value: unknown): SelfMarkResult {
  if (value === "correct" || value === "incorrect" || value === "skipped")
    return value;
  if (value === true) return "correct"; // ← legacy bool handled
  if (value === false) return "incorrect"; // ← legacy bool handled
  return "skipped";
}

// sessionSlice.ts L34-39 — does NOT handle booleans:
function normalizeResult(value: unknown): SelfMarkResult {
  if (value === "correct" || value === "incorrect" || value === "skipped")
    return value;
  return "skipped"; // ← boolean true/false falls through to "skipped"
}
```

---

### m-03 · `asString`, `asNumber`, `isRecord`, `inferYearFromText` duplicated across `loader.ts` and `build-question-data.ts`

- **File:** `scripts/build-question-data.ts` (lines 26–53); `src/lib/loader.ts` (lines 57–90)
- **Issue:** Six identical utility functions are duplicated. The script is not imported from the app (it runs via `tsx`), so some duplication is unavoidable — but the logic drift risk is real.
- **Impact:** If the year-inference regex or field-aliasing logic is changed in one file it must be manually kept in sync with the other. The build-time metadata extraction already disagrees slightly with runtime normalisation (e.g. the build script does not extract `secondary_topics` for the manifest, so pack metadata for topic filtering can be incomplete).

---

### m-04 · `dataManagement.ts` hardcodes localStorage keys that are also hardcoded in `loader.ts`

- **File:** `src/lib/dataManagement.ts`, line 45; `src/lib/loader.ts`, line 12
- **Issue:** The key `"esat-practice:question-data-state"` appears as a string literal in both files. The `clearProgressData` function also hardcodes `"esat-practice:sessions"` and `"esat-practice:stats"` which are not used by any other file (sessions and stats are stored in IndexedDB, not localStorage), making these dead entries.
- **Code:**

```ts
// dataManagement.ts L44-48
const keysToRemove = [
  "esat-practice:question-data-state",
  "esat-practice:sessions", // ← not actually used; sessions are in IDB
  "esat-practice:stats", // ← not actually used; stats are in IDB
];
```

---

### m-05 · `QuestionBank` page has a 1,010-line God component with no sub-component extraction

- **File:** `src/pages/question-bank/index.tsx`
- **Issue:** The entire page — state, filtering, virtualisation, dedup debug panel, data dump, row, detail panel — lives in one file. While some helpers are split into local components, the top-level `QuestionBank()` function has 11 `useState`, 5 `useEffect`, 9 `useMemo`, and 2 `useRef` hooks in a 296-line render function.
- **Impact:** Any state change (e.g. `scrollTop` updates 60 times/second during scroll) re-renders the entire function body and re-evaluates the hook ordering. The memos guard the expensive work, but the function re-execution itself, plus the reconciliation of the JSX for the header/controls/filter chips on each scroll event, is wasted work.

---

### m-06 · The service worker cache version is hardcoded as `"esat-v1"` with no build-time hash

- **File:** `public/sw.js`, line 1
- **Issue:** The cache name `"esat-v1"` is a static string. When the service worker is updated the old cache is deleted (lines 10–17), but the cache name itself never changes unless manually edited.
- **Impact:** Any time a new build is deployed, the service worker will serve stale cached assets until it activates (which requires a page reload or the `skipWaiting()` call). The `ASSETS` list also only includes `"/"`, `"/index.html"`, and `"/manifest.json"` — no JS or CSS assets are pre-cached, so the install cache is almost useless for the actual JS bundle.

---

### m-07 · `completePackLoading` divides by `currentState.totalBytes` which can be 0

- **File:** `src/lib/loadingProgress.ts`
- **Location:** `completePackLoading()`, line 73
- **Issue:** `Math.round((bytesLoaded / currentState.totalBytes) * 100)` will produce `NaN` if `totalBytes === 0` (which happens if no pack has `bytes` metadata, or if the fallback manifest is used).
- **Impact:** `percentComplete` becomes `NaN`, which propagates to any UI progress bar rendering `percentComplete%` — producing "NaN%" in the UI.
- **Code:**

```ts
// loadingProgress.ts L73
const percentComplete = Math.round(
  (bytesLoaded / currentState.totalBytes) * 100,
); // NaN if totalBytes is 0
```

---

## Missing Infrastructure

---

### MI-01 · No fetch-time request cancellation (AbortController)

There is no `AbortController` anywhere in the codebase. Fetches for both `manifest.json` and each pack file continue until completion regardless of user navigation, component unmount, or app teardown. For a 5 MB pack file on a slow connection this can result in several seconds of wasted bandwidth and a post-unmount IDB write.

---

### MI-02 · No build-time image extraction or JSON projection

The build script (`build-question-data.ts`) copies source JSON files verbatim to `public/data/packs/`. The dominant issue is that images are embedded as base64 strings rather than extracted to separate static files (see C-01). A secondary issue is that no schema projection occurs: redundant fields such as `classification.question_text` (a copy of `text`) and `classification.question_id` (a copy of `id`) are preserved in every published record. All of this means:

- The browser downloads image data for every question in a pack up front, whether or not those questions are ever shown.
- Images cannot be lazy-loaded, independently cached, or served with optimised encoding (WebP).
- Redundant field copies add unnecessary bytes to every record that contains a `classification` block.

The build script should extract base64 images to `public/data/images/` as real image files, replace the `image` field with `image_url`, and strip fields not present in the normalised `Question` type.

---

### MI-03 · No streaming or progressive loading within a single pack

Each pack is fetched entirely before any questions from it are written to IDB or displayed. There is no way to show questions from a partially-downloaded pack. Given that packs are 3.7–5.9 MB and parsing `response.json()` on the main thread blocks until the full body is received, there will be a visible freeze/delay when loading large packs on mobile.

A `ReadableStream` + incremental NDJSON format, or splitting large packs into smaller sub-packs, would allow progressive display.

---

### MI-04 · No in-memory or session-level cache for IDB reads

Every call to `getQuestionsByIdsFromDb`, `getAttemptsForSession`, `getRecentSessions`, etc. issues a new IDB transaction with no in-memory layer. For a session page that calls `load()` on mount, this means reading potentially 40+ question records and 40+ attempt records sequentially from IDB. An LRU cache or a simple `Map` keyed by question ID would eliminate most re-reads during a session.

---

### MI-05 · No pagination or cursor-based loading for the question-bank list

The question-bank page loads the entire question corpus into memory via `database.getAll("questions")` and applies all filtering in JS. There is no IDB cursor, index-based range query, or server-side pagination. With 1,500 questions this is manageable, but any growth (e.g. adding ESAT 2024/2025 papers, additional subject packs) will degrade both load time and memory usage linearly. An IDB index on `source.year`, `taxonomy.primary_topic`, etc. would allow the database to do the filtering work.

---

### MI-06 · Service worker does not pre-cache any pack data

`public/sw.js` pre-caches only `"/"`, `"/index.html"`, and `"/manifest.json"`. The `public/data/packs/` JSON files are not pre-cached at install time. They are cached opportunistically via the network-first fetch handler, but only after the first visit downloads them. This means:

- **Offline use** is not available on first visit.
- On second visit, the service worker _will_ serve cached packs, but only if the cache name has not been invalidated and the files fit within the browser's cache quota.
- There is no cache versioning strategy tied to the manifest's `version` field, so stale packs can be served after a data update.

---

### MI-07 · No search debouncing on the question-bank search input

- **File:** `src/pages/question-bank/index.tsx`, line 420
- The `search` state is updated on every `onChange` event (`event.target.value`). Each keystroke triggers `setSearch`, which invalidates the `filtered` memo (line 142), which re-sorts up to 1,500+ items on every keystroke.
- There is no `useDeferredValue`, `useTransition`, or debounce. On low-end devices, typing in the search box will produce visible jank.

---

### MI-08 · No error boundary around the question-bank or session pages

If `listQuestionsFromDb()` throws (e.g. IDB quota exceeded, schema mismatch after an app update, or browser IDB disabled in private mode), the error propagates as an unhandled rejection from the `loadQuestions` async function. There is no React Error Boundary wrapping any route, so the entire app will crash to a blank screen with no user-visible error message. The only error handling is inside `fetchJson` and the manifest fetch — IDB errors in the question store are completely unhandled.
