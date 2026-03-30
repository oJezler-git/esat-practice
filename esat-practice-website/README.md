# ESAT Practice Website

Learner-facing ESAT practice app built with React + Vite.

## Tech Stack

- React 19
- TypeScript
- Vite
- Zustand (state)
- IndexedDB via `idb` (local question storage/cache)

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

These are loaded by the app at runtime.

## Available Scripts

- `npm run dev` - start local dev server
- `npm run data:prepare` - build static data manifest + packs
- `npm run verify:loader` - validate loader/data assumptions
- `npm run build` - run data prep + type-check + production build
- `npm run preview` - preview the production build locally

## Deployment

### Option A: Single-host static deploy

Deploy as a normal Vite static app. Ensure output includes built app assets and generated data files.

### Option B: App + CDN data

1. Upload `public/data/**` to object storage/CDN.
2. Set:

```bash
VITE_DATA_BASE_URL=https://cdn.yourdomain.com
```

3. Build/deploy app.

The loader then fetches:

- `https://cdn.yourdomain.com/data/manifest.json`
- `https://cdn.yourdomain.com/data/packs/...`

## Data Update Workflow

1. Add/replace source files in `src/data/**`.
2. Regenerate static packs:

```bash
QUESTION_DATASET_VERSION=2026-03-30 npm run data:prepare
```

3. Validate + build:

```bash
npm run verify:loader
npm run build
```

## Notes

- First full bootstrap imports packs into IndexedDB for full-bank access.
- Generated files under `public/data` are ignored in git in this project.
