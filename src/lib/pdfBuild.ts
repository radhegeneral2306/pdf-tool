import { PDFDocument, degrees, type PDFImage, type PDFPage } from 'pdf-lib';
import type { PageItem, PageSize, Rotation } from '../types';
import { CUSTOM_LADDER, isEdited, type Level } from './compress';
import { jpegOrientation } from './imageUtils';

export interface EncodedImage {
  bytes: Uint8Array;
  format: 'jpg' | 'png';
  /** Clockwise rotation to apply when placing the (unrotated) pixels on the page. */
  rotation: Rotation;
}

export interface RasterPage {
  bytes: Uint8Array;
  widthPt: number;
  heightPt: number;
}

/** Browser-only work (canvas) is injected so the PDF assembly can be tested in Node. */
export interface BuildDeps {
  getBlob(id: string): Promise<Blob>;
  /** Renders rotation + crop + filter and encodes as JPEG. `level: null` means full size. */
  encodeImage(page: PageItem, blob: Blob, level: Level | null): Promise<EncodedImage>;
  /** Turns a PDF page into a JPEG (used only for "Compress PDF pages too"). */
  rasterizePdfPage(page: PageItem, blob: Blob, level: Level): Promise<RasterPage>;
}

export interface BuildOptions {
  pageSize: PageSize;
  margins: boolean;
  /** null = Original quality (no downsizing, untouched photos embedded byte for byte). */
  level: Level | null;
  compressPdfPages: boolean;
}

export type Progress = (done: number, total: number) => void;

const PAGE_SIZES: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};
const FIT_LONG_SIDE = 841.89;
const MARGIN = 28;

const EXIF_ROTATION: Record<number, Rotation | undefined> = { 1: 0, 3: 180, 6: 90, 8: 270 };

function sniff(bytes: Uint8Array): 'jpg' | 'png' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

/**
 * Untouched JPEG/PNG photos at Original quality are embedded as-is (zero quality loss).
 * Rotation (EXIF or user) is applied when drawing, so it stays lossless too.
 */
export function passthrough(page: PageItem, bytes: Uint8Array, level: Level | null): EncodedImage | null {
  if (level || isEdited(page)) return null;
  const format = sniff(bytes);
  if (format === 'png') return { bytes, format, rotation: page.rotation };
  if (format !== 'jpg') return null;
  const exif = EXIF_ROTATION[jpegOrientation(bytes)];
  if (exif === undefined) return null; // mirrored photos are rare; re-encode those
  return { bytes, format, rotation: ((exif + page.rotation) % 360) as Rotation };
}

function placeImage(out: PDFDocument, img: PDFImage, rotation: Rotation, opts: BuildOptions) {
  const w = img.width;
  const h = img.height;
  const [dw, dh] = rotation % 180 ? [h, w] : [w, h];
  const margin = opts.margins ? MARGIN : 0;

  let pageW: number;
  let pageH: number;
  if (opts.pageSize === 'fit') {
    const k = FIT_LONG_SIDE / Math.max(dw, dh);
    pageW = dw * k + margin * 2;
    pageH = dh * k + margin * 2;
  } else {
    const [a, b] = PAGE_SIZES[opts.pageSize];
    [pageW, pageH] = dw > dh ? [b, a] : [a, b];
  }
  const page = out.addPage([pageW, pageH]);
  const sc = Math.min((pageW - margin * 2) / dw, (pageH - margin * 2) / dh);
  const bw = dw * sc;
  const bh = dh * sc;
  const bx = (pageW - bw) / 2;
  const by = (pageH - bh) / 2;
  // pdf-lib rotates counter-clockwise around the image's bottom-left corner.
  const anchor: Record<Rotation, [number, number]> = {
    0: [bx, by],
    90: [bx, by + bh],
    180: [bx + bw, by + bh],
    270: [bx + bw, by],
  };
  const [x, y] = anchor[rotation];
  page.drawImage(img, { x, y, width: w * sc, height: h * sc, rotate: degrees((360 - rotation) % 360) });
}

/** Assembles the final PDF from pages in order. */
export async function buildPdf(
  pages: PageItem[],
  opts: BuildOptions,
  deps: BuildDeps,
  onProgress?: Progress,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setProducer('PDF Tool');
  out.setCreator('PDF Tool');
  const rasterize = !!(opts.level && opts.compressPdfPages);

  // Copy all pages of each source PDF in ONE copyPages call. pdf-lib creates a fresh
  // object copier per call, so copying page by page would duplicate shared fonts,
  // images and XObjects once per page. Duplicate indices are fine: each gets its own
  // page dict while the resources behind it stay shared.
  const copied = new Map<string, PDFPage[]>();
  if (!rasterize) {
    const wanted = new Map<string, number[]>();
    for (const p of pages) {
      if (p.kind !== 'pdfPage') continue;
      const list = wanted.get(p.blobId) ?? [];
      list.push(p.pdfPageIndex ?? 0);
      wanted.set(p.blobId, list);
    }
    for (const [blobId, indices] of wanted) {
      const src = await PDFDocument.load(await (await deps.getBlob(blobId)).arrayBuffer(), { updateMetadata: false });
      copied.set(blobId, await out.copyPages(src, indices));
    }
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (page.kind === 'pdfPage') {
      if (rasterize) {
        const blob = await deps.getBlob(page.blobId);
        const r = await deps.rasterizePdfPage(page, blob, opts.level!);
        const img = await out.embedJpg(r.bytes);
        out.addPage([r.widthPt, r.heightPt]).drawImage(img, { x: 0, y: 0, width: r.widthPt, height: r.heightPt });
      } else {
        // Pages come off each source's list in the same order they were requested.
        const pdfPage = copied.get(page.blobId)!.shift()!;
        if (page.rotation) pdfPage.setRotation(degrees((pdfPage.getRotation().angle + page.rotation) % 360));
        out.addPage(pdfPage);
      }
    } else {
      const blob = await deps.getBlob(page.blobId);
      // Only read the original bytes when they might be embedded as-is.
      const direct = !opts.level && !isEdited(page) ? passthrough(page, new Uint8Array(await blob.arrayBuffer()), null) : null;
      const enc = direct ?? (await deps.encodeImage(page, blob, opts.level));
      const img = enc.format === 'png' ? await out.embedPng(enc.bytes) : await out.embedJpg(enc.bytes);
      placeImage(out, img, enc.rotation, opts);
    }
    onProgress?.(i + 1, pages.length);
  }
  return out.save();
}

/**
 * Finds the best quality that fits under `targetBytes` by trying ladder steps
 * (binary search). `fits` is false when even the smallest step is too big.
 */
export async function buildPdfUnder(
  pages: PageItem[],
  targetBytes: number,
  opts: Omit<BuildOptions, 'level'>,
  deps: BuildDeps,
  onStep?: (attempt: number) => void,
): Promise<{ bytes: Uint8Array; fits: boolean }> {
  let lo = 0;
  let hi = CUSTOM_LADDER.length - 1;
  let best: Uint8Array | null = null;
  let last: Uint8Array | null = null;
  let attempt = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    onStep?.(++attempt);
    last = await buildPdf(pages, { ...opts, level: CUSTOM_LADDER[mid] }, deps);
    if (last.byteLength <= targetBytes) {
      best = last;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return best ? { bytes: best, fits: true } : { bytes: last!, fits: false };
}
