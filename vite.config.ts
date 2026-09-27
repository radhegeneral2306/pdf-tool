/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Repo name on GitHub Pages. The app lives at https://<user>.github.io/pdf-tool/
const BASE = '/pdf-tool/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'PDF Tool',
        short_name: 'PDF Tool',
        description: 'Scan, convert and merge PDFs. Works offline, files never leave your device.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2F2F7',
        theme_color: '#F2F2F7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // pdf.js worker is a large .mjs file; it must be precached or PDFs won't open offline.
        // pdfjs/ holds pdf.js runtime assets (see scripts/copy-pdfjs.mjs): wasm image
        // decoders (+ JS fallbacks), CMaps (.bcmap), standard fonts (.pfb/.ttf), ICC profiles.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,ico,webmanifest,wasm,bcmap,pfb,ttf,icc}'],
        // QuickJS is only for PDF form scripting, which this app never enables.
        // cv/ (OpenCV.js ~11 MB + detection worker) is loaded lazily when the
        // scanner opens and cached at runtime below instead of precached.
        globIgnores: ['**/node_modules/**/*', 'pdfjs/wasm/quickjs-eval.*', 'cv/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/cv\/(opencv|detect-worker)\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'opencv',
              expiration: { maxEntries: 4, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
