import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Rotation } from '../types';
import { MAX_CANVAS_PIXELS } from './imageUtils';

// The legacy build supports older iPhones and Android browsers.
let lib: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
function pdfjs() {
  lib ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([m, worker]) => {
    m.GlobalWorkerOptions.workerSrc = worker.default;
    return m;
  });
  return lib;
}

// pdf.js fetches these at runtime. scripts/copy-pdfjs.mjs copies them from
// node_modules/pdfjs-dist into public/pdfjs/ before dev/build. Without wasmUrl,
// JBIG2/JPEG2000 images (common in scanned PDFs) render blank.
const PDFJS_ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

type LoadingTask = import('pdfjs-dist/legacy/build/pdf.mjs').PDFDocumentLoadingTask;

interface CachedDoc {
  task: Promise<LoadingTask>;
  doc: Promise<PDFDocumentProxy>;
}

/** Max open documents; the least recently used one is destroyed beyond this. */
const MAX_DOCS = 4;
// Map iteration order is insertion order, so re-inserting on access makes it an LRU.
const docs = new Map<string, CachedDoc>();

function evict(blobId: string) {
  const entry = docs.get(blobId);
  if (!entry) return;
  docs.delete(blobId);
  // PDFDocumentProxy has no destroy() in this pdf.js version; the loading task does.
  entry.task.then((t) => t.destroy()).catch(() => {});
}

/** Opens a PDF once and keeps it cached by blob id (small LRU). */
export function openPdf(blobId: string, blob: Blob): Promise<PDFDocumentProxy> {
  const hit = docs.get(blobId);
  if (hit) {
    docs.delete(blobId);
    docs.set(blobId, hit);
    return hit.doc;
  }
  const task = (async () => {
    const m = await pdfjs();
    const data = new Uint8Array(await blob.arrayBuffer());
    return m.getDocument({
      data,
      wasmUrl: `${PDFJS_ASSETS}wasm/`,
      cMapUrl: `${PDFJS_ASSETS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
      iccUrl: `${PDFJS_ASSETS}iccs/`,
    });
  })();
  const doc = task.then((t) => t.promise);
  const entry: CachedDoc = { task, doc };
  doc.catch(() => {
    if (docs.get(blobId) === entry) evict(blobId);
  });
  docs.set(blobId, entry);
  while (docs.size > MAX_DOCS) evict(docs.keys().next().value!);
  return doc;
}

/**
 * Renders one PDF page to a canvas whose long side is at most `maxDim` pixels,
 * with the user's extra rotation applied. White background (for JPEG output).
 */
export async function renderPdfPage(
  blobId: string,
  blob: Blob,
  pageIndex: number,
  extraRotation: Rotation,
  maxDim: number,
): Promise<{ canvas: HTMLCanvasElement; widthPt: number; heightPt: number }> {
  const doc = await openPdf(blobId, blob);
  const page = await doc.getPage(pageIndex + 1);
  const rotation = (page.rotate + extraRotation) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  let scale = Math.min(maxDim / Math.max(base.width, base.height), 8);
  scale = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height)));
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return { canvas, widthPt: base.width, heightPt: base.height };
}
