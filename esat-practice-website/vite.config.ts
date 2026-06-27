import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
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
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}", "*.png"],
        globIgnores: ["data/**"],
        navigateFallback: "/index.html",
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
    setupFiles: "./src/vitest-setup.ts",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "cloudflare-worker/**/*.{test,spec}.{js,ts}"],
  },
});
