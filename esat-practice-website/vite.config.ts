import { defineConfig } from "vitest/config";
import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

const mdxPlugin = mdx({
  remarkPlugins: [remarkGfm, remarkMath],
  // output: "html" emits only KaTeX's HTML (no duplicate MathML tree), roughly
  // halving the pre-rendered math DOM per guide for a much cheaper render/commit.
  rehypePlugins: [[rehypeKatex, { output: "html" }]],
});

// @mdx-js/rollup strips the query string before checking the file extension, so it
// recompiles .mdx files requested with ?raw into MDX components instead of leaving
// them as plain text. Skip MDX compilation for those requests so Vite's own ?raw
// handling can return the raw source.
const mdxPluginRawSafe = {
  ...mdxPlugin,
  transform(code: string, id: string) {
    if (id.includes("?raw")) {
      return null;
    }
    return mdxPlugin.transform(code, id);
  },
};

export default defineConfig({
  plugins: [
    tailwindcss(),
    mdxPluginRawSafe,
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icon-512.png", "icon-maskable-512.png", "screenshots/*.webp"],
      manifest: {
        name: "ESAT Practice",
        short_name: "ESAT",
        description:
          "Installs as a standalone app with offline support - hundreds of past paper questions with timed sessions, topic drills, and progress tracking.",
        id: "/",
        start_url: "/",
        display: "standalone",
        background_color: "#101412",
        theme_color: "#101412",
        categories: ["education"],
        orientation: "any",
        icons: [
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "/screenshots/desktop.webp",
            sizes: "1280x720",
            type: "image/webp",
            form_factor: "wide",
            label: "ESAT Practice — home screen on desktop",
          },
          {
            src: "/screenshots/mobile.webp",
            sizes: "420x896",
            type: "image/webp",
            form_factor: "narrow",
            label: "ESAT Practice — home screen on mobile",
          },
        ],
        shortcuts: [
          {
            name: "Custom Session",
            short_name: "Custom",
            description: "Configure topics, timing, and question count for a tailored practice session",
            url: "/practice",
            icons: [{ src: "/icon-512.png", sizes: "512x512" }],
          },
          {
            name: "Question Bank",
            short_name: "Questions",
            description: "Browse all ENGAA and NSAA past paper questions by topic",
            url: "/question-bank",
            icons: [{ src: "/icon-512.png", sizes: "512x512" }],
          },
          {
            name: "My Progress",
            short_name: "Progress",
            description: "Review your accuracy stats across every topic",
            url: "/progress",
            icons: [{ src: "/icon-512.png", sizes: "512x512" }],
          },
        ],
      },
      workbox: {
        // Pull our push/notification handlers into the generated service worker.
        importScripts: ["/push-sw.js"],
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}", "*.png"],
        globIgnores: ["data/**"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/data\/images\//,
            handler: "CacheFirst",
            options: {
              cacheName: "esat-images",
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    // Heavy jsdom page tests starve past the 5s default when the full suite
    // runs in parallel with coverage instrumentation.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    setupFiles: "./src/vitest-setup.ts",
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
      "cloudflare-worker/**/*.{test,spec}.{js,ts}",
    ],
    coverage: {
      // Count every shipped source file, not just the ones tests import.
      include: [
        "src/**/*.{ts,tsx,js}",
        "scripts/**/*.ts",
        "cloudflare-worker/**/*.js",
      ],
      exclude: [
        "**/*.{test,spec}.{ts,tsx,js}",
        "src/data/**",
        "src/types/schema.ts",
        "src/types/engine.ts",
        "src/vitest-setup.ts",
        "src/vite-env.d.ts",
        "src/main.tsx",
      ],
      reportOnFailure: true,
      // Ratchet floor just under the current baseline (63.7% lines after the
      // 2026-07-11 review-round gap closing) so regressions fail the run;
      // raise as coverage improves.
      thresholds: {
        lines: 62,
        statements: 62,
        branches: 64,
        functions: 78,
      },
    },
  },
});
