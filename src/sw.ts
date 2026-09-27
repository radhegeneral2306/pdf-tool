/// <reference lib="webworker" />
// Service worker (built by vite-plugin-pwa with strategies: 'injectManifest').
// Mirrors the previous generateSW config (precache + SPA navigate fallback +
// OpenCV runtime cache + 'prompt' update flow) and adds a Web Share Target
// handler so files shared from other Android apps land in the PDF Tool.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

/** App base path, e.g. '/pdf-tool/' (the SW is served from, and scoped to, the base). */
const BASE = new URL(self.registration.scope).pathname;
const SHARE_TARGET_PATH = `${BASE}share-target`;
/** Cache Storage bucket the app reads shared files from (see app-side import). */
const SHARED_CACHE = 'shared-files';

// ---- Web Share Target -------------------------------------------------------
// Registered before the workbox routes so this listener gets first look at the
// POST. Workbox routes only match GET, so they never compete for it anyway.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== SHARE_TARGET_PATH) {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll('files').filter((f): f is File => f instanceof File);
        const cache = await caches.open(SHARED_CACHE);
        const stamp = Date.now();
        await Promise.all(
          files.map((file, i) =>
            cache.put(
              `${BASE}__shared/${stamp}-${i}`,
              new Response(file, {
                headers: {
                  'content-type': file.type || 'application/octet-stream',
                  'x-file-name': encodeURIComponent(file.name),
                },
              }),
            ),
          ),
        );
      } catch (err) {
        console.error('share-target: failed to store shared files', err);
      }
      return Response.redirect(`${BASE}#/open`, 303);
    })(),
  );
});

// ---- Precache + SPA navigation fallback ------------------------------------
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`), {
    denylist: [new RegExp(`^${SHARE_TARGET_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)],
  }),
);

// ---- OpenCV (lazy, large): cache on first use rather than precache ----------
registerRoute(
  ({ url }) => /\/cv\/(opencv|detect-worker)\.js$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'opencv',
    plugins: [
      new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 31536000 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ---- OCR (tesseract.js, lazy, large): worker, wasm core, traineddata --------
// Self-hosted under ocr/ (scripts/copy-ocr.mjs); cached on first OCR use.
registerRoute(
  ({ url }) => /\/ocr\/(worker\.min\.js|core\/.+|lang\/.+\.traineddata\.gz)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'ocr',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 31536000 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ---- Update flow (registerType: 'prompt') ----------------------------------
// UpdateBanner's updateSW(true) posts SKIP_WAITING to the waiting worker, then
// reloads once it takes control.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

clientsClaim();
