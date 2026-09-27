import type { Worker as TessWorker } from 'tesseract.js';
import { PDFDocument } from 'pdf-lib';
import { canvasToBlob, freeCanvas, renderImagePage } from './imageUtils';
import { openPdf, renderPdfPage } from './pdfRender';
import type { OcrCleanup, OcrLang } from './ocrText';
import { uid } from '../storage/db';

/**
 * OCR with tesseract.js. Recognition runs inside tesseract's own Web Worker, so the
 * screen stays responsive. All files come from this app (public/ocr), never a CDN,
 * and the service worker keeps them for offline use after the first run.
 */

const OCR_BASE = `${import.meta.env.BASE_URL}ocr/`;
/** Long side used for OCR: sharp enough for small print, small enough for phones. */
const IMAGE_DIM = 2500;
const PDF_DIM = 2200;

export type OcrSource =
  | { kind: 'image'; blob: Blob; name: string }
  | { kind: 'pdf'; blob: Blob; name: string; blobKey: string; pageIndex: number };

let worker: TessWorker | null = null;
let workerLang: OcrLang | null = null;
let onProgress: ((p: number) => void) | null = null;

async function getWorker(lang: OcrLang): Promise<TessWorker> {
  if (worker && workerLang === lang) return worker;
  await worker?.terminate();
  worker = null;
  const { createWorker, OEM } = await import('tesseract.js');
  const w = await createWorker(lang, OEM.LSTM_ONLY, {
    workerPath: `${OCR_BASE}worker.min.js`,
    corePath: `${OCR_BASE}core`,
    langPath: `${OCR_BASE}lang`,
    gzip: true,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  worker = w;
  workerLang = lang;
  return w;
}

/** Stops OCR immediately. The next run starts a fresh worker. */
export async function cancelOcr() {
  const w = worker;
  worker = null;
  workerLang = null;
  await w?.terminate().catch(() => {});
}

/** Expands chosen files into pages (a PDF becomes one source per page). */
export async function expandSources(files: File[]): Promise<{ sources: OcrSource[]; skipped: string[] }> {
  const sources: OcrSource[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (isPdf) {
      try {
        const key = `ocr-${uid()}`;
        const doc = await openPdf(key, f);
        for (let i = 0; i < doc.numPages; i++) sources.push({ kind: 'pdf', blob: f, name: f.name, blobKey: key, pageIndex: i });
      } catch {
        skipped.push(`${f.name} could not be opened (damaged or password protected).`);
      }
    } else if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)) {
      sources.push({ kind: 'image', blob: f, name: f.name });
    } else {
      skipped.push(`${f.name} is not an image or PDF.`);
    }
  }
  return { sources, skipped };
}

export function sourceLabel(s: OcrSource): string {
  return s.kind === 'pdf' ? `${s.name}, page ${s.pageIndex + 1}` : s.name;
}

const FILTER = { off: 'original', enhance: 'clearScan', bw: 'bw' } as const;

/** Draws one page, cleaned up with the app's existing scan filters if asked. */
async function pageCanvas(s: OcrSource, cleanup: OcrCleanup): Promise<HTMLCanvasElement> {
  let blob = s.blob;
  if (s.kind === 'pdf') {
    const { canvas } = await renderPdfPage(s.blobKey, s.blob, s.pageIndex, 0, PDF_DIM);
    if (cleanup === 'off') return canvas;
    blob = await canvasToBlob(canvas, 'image/png');
    freeCanvas(canvas);
  }
  const { canvas } = await renderImagePage(blob, { rotation: 0, filter: FILTER[cleanup] }, IMAGE_DIM);
  return canvas;
}

export interface PageOutput {
  text: string;
  pdf?: Uint8Array;
}

/** Recognizes one page. `progress` gets 0..1 while tesseract works. */
export async function recognizeSource(
  s: OcrSource,
  opts: { lang: OcrLang; cleanup: OcrCleanup; pdf: boolean },
  progress: (p: number) => void,
): Promise<PageOutput> {
  const w = await getWorker(opts.lang);
  const canvas = await pageCanvas(s, opts.cleanup);
  onProgress = progress;
  try {
    const { data } = await w.recognize(canvas, {}, { text: true, pdf: opts.pdf });
    const pdf = data.pdf ? new Uint8Array(data.pdf) : undefined;
    return { text: data.text ?? '', pdf };
  } finally {
    onProgress = null;
    freeCanvas(canvas);
  }
}

/** Joins the one-page PDFs from tesseract into one searchable PDF. */
export async function mergePagePdfs(pages: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setProducer('PDF Tool OCR');
  for (const bytes of pages) {
    const src = await PDFDocument.load(bytes);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  }
  return out.save();
}
