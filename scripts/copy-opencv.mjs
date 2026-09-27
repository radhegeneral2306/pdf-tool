// Copies the OpenCV.js build (single file, wasm embedded) into public/cv/ so
// the corner-detection worker (public/cv/detect-worker.js) can importScripts it.
// It is NOT precached (see globIgnores in vite.config.ts); the service worker
// caches it at runtime the first time the scanner opens.
// Runs automatically via the npm "predev" and "prebuild" scripts.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js');
const destDir = join(root, 'public', 'cv');

if (!existsSync(src)) {
  console.warn(`copy-opencv: ${src} not found, skipping`);
} else {
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, join(destDir, 'opencv.js'));
  console.log('copy-opencv: copied opencv.js to public/cv/');
}
