# ESAT Data Pipeline

Interactive pipeline for extracting and classifying ENGAA and NSAA questions from source material.

## Tech Stack

- React 18
- TypeScript
- Vite
- Dexie + dexie-react-hooks
- PDF processing via `pdfjs-dist`
- Anthropic API integration for classification stages

## Prerequisites

- Node.js 20+
- npm 10+

## Run Locally

```bash
npm install
npm run dev
```

## Available Scripts

- `npm run dev` - start local dev server
- `npm run check:question-counts` - verify extracted/segmented question counts
- `npm run build` - type-check + production build
- `npm run preview` - preview production build locally

## What This App Does

- Upload and process source PDFs
- Segment question blocks
- Run staged classification with an Anthropic-backed pipeline
- Inspect debug traces, extraction logs, segmented questions, and final results
- Export pipeline outputs/debug runs

## Configuration

Classification requires an Anthropic API key (entered in the UI control panel).

Optional environment variables:

- `VITE_ANTHROPIC_MESSAGES_URL` - override Anthropic messages endpoint
- `VITE_DEBUG_LOGS=0` - disable debug logs

## Typical Workflow

1. Start app with `npm run dev`.
2. Load source files and optional answer-key inputs.
3. Configure threshold/image settings and API key.
4. Run extraction + classification.
5. Review debug sections and export results.
