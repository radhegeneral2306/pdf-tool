// Copies pdf.js runtime assets (wasm decoders, CMaps, standard fonts, ICC
// profiles) into public/pdfjs/ so they are served at <base>/pdfjs/<dir>/.
// Runs automatically via the npm "predev" and "prebuild" scripts.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');
const DIRS = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];

rmSync(dest, { recursive: true, force: true });
for (const dir of DIRS) {
  const from = join(src, dir);
  if (!existsSync(from)) {
    console.warn(`copy-pdfjs: ${from} not found, skipping`);
    continue;
  }
  cpSync(from, join(dest, dir), { recursive: true });
}
console.log(`copy-pdfjs: copied ${DIRS.join(', ')} to public/pdfjs/`);
