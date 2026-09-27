// Generates the app icons in public/icons from the Phosphor "FileText" (fill) glyph.
// Usage: node scripts/make-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

const BLUE = '#007AFF';

// Read the glyph path straight from the installed Phosphor package (fill weight).
const defsFile = resolve(root, 'node_modules/@phosphor-icons/react/dist/defs/FileText.es.js');
const defs = readFileSync(defsFile, 'utf8');
const match = defs.match(/\[\s*"fill",[\s\S]*?\bd:\s*"([^"]+)"/);
if (!match) throw new Error('Could not find FileText fill path in ' + defsFile);
const GLYPH_PATH = match[1];

// Glyph bounding box inside Phosphor's 256x256 viewBox (x 40..216, y 24..232).
const GLYPH_H = 208;
const GLYPH_CX = 128;
const GLYPH_CY = 128;

/** Build a square icon SVG. `ratio` is the glyph height relative to the icon size. */
function iconSvg(size, ratio, { radius = 0 } = {}) {
  const s = (size * ratio) / GLYPH_H;
  const tx = size / 2 - GLYPH_CX * s;
  const ty = size / 2 - GLYPH_CY * s;
  const rx = radius ? ` rx="${(size * radius).toFixed(2)}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}"${rx} fill="${BLUE}"/>` +
    `<path transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(5)})" fill="#fff" d="${GLYPH_PATH}"/>` +
    `</svg>`
  );
}

// favicon.svg: same design with rounded corners.
writeFileSync(resolve(outDir, 'favicon.svg'), iconSvg(64, 0.55, { radius: 0.22 }) + '\n');

const pngs = [
  { file: 'icon-192.png', size: 192, ratio: 0.55 },
  { file: 'icon-512.png', size: 512, ratio: 0.55 },
  { file: 'icon-maskable-512.png', size: 512, ratio: 0.45 },
  { file: 'apple-touch-icon.png', size: 180, ratio: 0.55 },
];

// Prefer a locally installed playwright, fall back to the global install.
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = createRequire('/opt/node22/lib/node_modules/')('playwright');
}

const browser = await playwright.chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, size, ratio } of pngs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${BLUE}">${iconSvg(size, ratio)}</body></html>`,
    );
    await page.locator('svg').screenshot({ path: resolve(outDir, file), omitBackground: false });
    console.log('wrote', file);
  }
} finally {
  await browser.close();
}
console.log('wrote favicon.svg');
