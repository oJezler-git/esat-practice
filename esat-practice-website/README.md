# ESAT Practice Delivery Guide

## 1. Run locally

```bash
npm install
npm run data:prepare
npm run dev
```

`npm run data:prepare` builds:

- `public/data/manifest.json`
- `public/data/packs/**/*.json`

These are served as static files and loaded by the app at runtime.

## 2. Build production

```bash
npm run build
```

`build` already runs `data:prepare` first, then TypeScript + Vite build.

## 3. What changed

- Question JSON is no longer bundled via `import.meta.glob`.
- App now loads from `data/manifest.json` and then fetches packs listed there.
- Loader keeps progress in `localStorage` so previously imported packs are not reprocessed.

Key files:

- `src/lib/loader.ts`
- `scripts/build-question-data.ts`
- `package.json` (`data:prepare`, updated `build`)

## 4. Deploy model options

### Option A: single-host deploy (simplest)

Deploy the built site as normal. Ensure static hosting includes:

- `dist/**` (app)
- `public/data/**` (manifest + packs, copied to final static output)

Works on Vercel, Netlify, Cloudflare Pages, static Nginx, etc.

### Option B: split app + CDN data (recommended for scale)

1. Upload `public/data/**` to object storage/CDN.
2. Set build env var:

```bash
VITE_DATA_BASE_URL=https://cdn.yourdomain.com
```

3. Build and deploy app normally.

Loader will request:

- `https://cdn.yourdomain.com/data/manifest.json`
- `https://cdn.yourdomain.com/data/packs/...`

## 5. Cache headers

Use:

- `data/manifest.json`: short cache (`max-age=60` or similar)
- `data/packs/*.json`: long immutable cache (`max-age=31536000, immutable`)
- Enable Brotli/Gzip compression on JSON responses

## 6. Data update workflow

1. Add/replace source files in `src/data/**`.
2. Generate new manifest/packs:

```bash
QUESTION_DATASET_VERSION=2026-03-30 npm run data:prepare
```

3. Deploy `public/data/**` first (if using separate CDN).
4. Deploy app build.

## 7. Validation

```bash
npm run verify:loader
npm run build
```

## 8. Operational notes

- First complete data bootstrap still imports all packs into IndexedDB for full bank features.
- Architecture now supports moving packs out of JS bundle and onto CDN/static storage.
- If you later want true selective loading (only chosen years/topics before session start), this loader structure is ready for that next step.
