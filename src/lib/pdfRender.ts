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

const docs = new Map<string, Promise<PDFDocumentProxy>>();

/** Opens a PDF once and keeps it cached by blob id. */
export function openPdf(blobId: string, blob: Blob): Promise<PDFDocumentProxy> {
  let doc = docs.get(blobId);
  if (!doc) {
    doc = (async () => {
      const m = await pdfjs();
      const data = new Uint8Array(await blob.arrayBuffer());
      return m.getDocument({ data }).promise;
    })();
    doc.catch(() => docs.delete(blobId));
    docs.set(blobId, doc);
  }
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
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return { canvas, widthPt: base.width, heightPt: base.height };
}
