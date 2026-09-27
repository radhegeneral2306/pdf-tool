// Copies tesseract.js OCR runtime assets into public/ocr/ so OCR is self-hosted
// (no CDN) and works offline after first use:
//   public/ocr/worker.min.js  tesseract.js web worker
//   public/ocr/core/          tesseract.js-core builds (LSTM-only engine)
//   public/ocr/lang/          traineddata (tessdata "best" = 4.0.0 folder)
// They are NOT precached (see globIgnores in vite.config.ts); the service
// worker caches them at runtime (cache 'ocr', src/sw.ts) on first OCR use.
// Runs automatically via the npm "predev" and "prebuild" scripts.
//
// With corePath set to a directory, tesseract.js v7 (getCore.js) importScripts
// exactly one of these, based on wasm feature detection, for the default
// LSTM-only engine (OEM LSTM_ONLY / DEFAULT, no legacyCore):
//   relaxed SIMD -> tesseract-core-relaxedsimd-lstm.wasm.js
//   SIMD         -> tesseract-core-simd-lstm.wasm.js
//   neither      -> tesseract-core-lstm.wasm.js
// The .wasm.js builds embed the wasm binary; the plain .js/.wasm pairs are
// copied alongside for completeness (only used if corePath names a .js file).
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const destDir = join(root, 'public', 'ocr');

const coreVariants = ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm'];
// Only the .wasm.js builds are ever fetched (corePath is a directory), so ship just those.
const coreFiles = coreVariants.map((v) => `${v}.wasm.js`);

/** [source, destination relative to public/ocr] */
const copies = [
  [join(nm, 'tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js'],
  ...coreFiles.map((f) => [join(nm, 'tesseract.js-core', f), join('core', f)]),
  ...['eng', 'hin'].map((lang) => [
    join(nm, '@tesseract.js-data', lang, '4.0.0', `${lang}.traineddata.gz`),
    join('lang', `${lang}.traineddata.gz`),
  ]),
];

rmSync(destDir, { recursive: true, force: true });
mkdirSync(join(destDir, 'core'), { recursive: true });
mkdirSync(join(destDir, 'lang'), { recursive: true });

let copied = 0;
for (const [src, rel] of copies) {
  if (!existsSync(src)) {
    console.warn(`copy-ocr: ${src} not found, skipping`);
    continue;
  }
  copyFileSync(src, join(destDir, rel));
  copied++;
}
console.log(`copy-ocr: copied ${copied}/${copies.length} files to public/ocr/`);
