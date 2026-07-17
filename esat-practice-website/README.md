# ESAT Practice Website

Learner-facing ESAT practice app built with React + Vite. Targets Cambridge Engineering applicants sitting Mathematics 1, Mathematics 2, and Physics modules.

## Features

**Practice sessions** — configurable by topic, year, paper, question count, and mode (timed / self-mark / exam). Full-screen session UI with keyboard navigation, flagging, and a per-session timer.

**Scoring and progress** — per-topic accuracy tracked with EWMA. Results page shows topic breakdowns and estimated ESAT scaled scores (1–9) with confidence bands per module. Progress page shows all-time stats and accuracy history charts.

**Session history** — `/history` lists all past sessions with an activity heatmap and per-session detail (accuracy, time, topic breakdown).

**Score reference** — `/score-reference` explains the 1–9 scale, module difficulty differences, and the assumptions behind the in-app score estimates.

**Question annotations** — freehand drawing layer on every question card (pen, highlighter, line, arrow, rectangle, ellipse, text) with undo/redo, colour, and width controls. Annotations persist per question via localStorage.

**Ask Claude** — button on each question that opens a structured AI explanation prompt (concept, fast recognition, fastest solution, option analysis) in the user's Claude session.

**Question bank** — browse all questions, filter by topic/year, exclude questions from future sessions.

**Cloud sync** — push/pull all session data (sessions, attempts, stats, excluded questions) between devices using a memorable word-pair-plus-digits sync key. A local backup is saved before every pull so it can be undone.

**Offline image cache** — settings page lets users pre-download all question diagram images via the Cache API so sessions work fully offline.

**PWA** — installable on desktop and mobile, service worker for offline shell caching.

## Tech Stack

- React 19 + TypeScript
- Vite 8
- Zustand 5 (state)
- IndexedDB via `idb` (question storage, sessions, stats)
- Vercel Analytics + Speed Insights

## Prerequisites

- Node.js 20+
- npm 10+

## Run Locally

```bash
npm install
npm run data:prepare
npm run dev
```

`npm run data:prepare` generates:

- `public/data/manifest.json`
- `public/data/packs/**/*.json`

These are loaded by the app at runtime and cached in IndexedDB after the first visit.

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run data:prepare` | Build static data manifest + packs |
| `npm run build` | data:prepare + type-check + production build |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest unit tests |
| `npm run test:ui` | Vitest with browser UI |

## Deployment

### Option A: Single-host static deploy

Deploy as a normal Vite static app. Ensure the output includes the built app assets and the generated data files under `public/data/`.

### Option B: App + CDN data

1. Upload `public/data/**` to object storage/CDN.
2. Set the environment variable:

```bash
VITE_DATA_BASE_URL=https://cdn.yourdomain.com
```

3. Build and deploy the app.

The loader then fetches:

- `https://cdn.yourdomain.com/data/manifest.json`
- `https://cdn.yourdomain.com/data/packs/...`

## Data Update Workflow

1. Add/replace source files in `src/data/**`.
2. Regenerate static packs with a version stamp:

```bash
QUESTION_DATASET_VERSION=2026-03-30 npm run data:prepare
```

3. Build:

```bash
npm run build
```

The version stamp causes the loader to re-fetch and re-import packs on next visit. Without a changed version, returning users keep their cached data.

## Push reminders

Opt-in daily practice reminders are delivered via the Web Push protocol. The
Cloudflare Worker (`cloudflare-worker/`) stores each device's subscription and
chosen local time in KV and runs a cron trigger every 15 minutes to send the
notifications. No third-party push service is used — the worker signs VAPID JWTs
and encrypts payloads with the WebCrypto API directly.

Setup:

1. Generate a VAPID key pair (base64url). Any web-push VAPID generator works,
   e.g. with the `web-push` CLI:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Give the worker the keys (from `cloudflare-worker/`):

   ```bash
   npx wrangler secret put VAPID_PUBLIC_KEY    # the public key
   npx wrangler secret put VAPID_PRIVATE_KEY   # the private key
   ```

   Set `VAPID_SUBJECT` in `wrangler.toml` to a `mailto:` or `https:` you control,
   then `npx wrangler deploy`. The `[triggers] crons` entry registers the sweep.

3. Expose the **same public key** to the frontend so browsers can subscribe:

   ```bash
   VITE_VAPID_PUBLIC_KEY=<public key>
   ```

Users enable reminders under **Settings → Notifications**. Reminders are
best-effort: on Chrome/Edge/Android and installed PWAs they fire even when the
app is closed; on iOS the app must be added to the Home Screen first.

## Disclaimer

This project is an independent, community-built study tool and is **not affiliated with, endorsed by, or associated with** the Engineering and Science Admissions Test (ESAT), Cambridge Assessment Admissions Testing, or the University of Cambridge in any way. All question content is used for educational purposes only.
