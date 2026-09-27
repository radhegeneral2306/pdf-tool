import type { ProcessRequest, ProcessResponse } from '../workers/process.worker';
import type { FilterId, Quad, Rotation } from '../types';
import { isFullQuad, quadOutputSize, scaleQuad } from './perspective';

/** iOS Safari refuses canvases bigger than ~16.7 million pixels. Stay safely under it. */
export const MAX_CANVAS_PIXELS = 16_000_000;

type Decoded = ImageBitmap | HTMLImageElement;

/** Decodes an image file with its EXIF orientation applied (photos appear upright). */
export async function decodeImage(blob: Blob): Promise<Decoded> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    /* older browsers: fall through */
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('This image format is not supported. Please use JPEG or PNG.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sizeOf = (d: Decoded) =>
  d instanceof HTMLImageElement ? { w: d.naturalWidth, h: d.naturalHeight } : { w: d.width, h: d.height };

const release = (d: Decoded) => {
  if (!(d instanceof HTMLImageElement)) d.close(); // safe to call twice
};

/** Frees a canvas's memory right away (important on phones). */
export function freeCanvas(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/jpeg', quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality),
  );
}

/** Reads the EXIF orientation (1 to 8) of a JPEG. Returns 1 when missing. */
export function jpegOrientation(bytes: Uint8Array): number {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      const tiff = off + 10;
      const little = v.getUint16(tiff) === 0x4949;
      const ifd = tiff + v.getUint32(tiff + 4, little);
      if (ifd + 2 > v.byteLength) return 1;
      const count = v.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > v.byteLength) return 1;
        if (v.getUint16(e, little) === 0x0112) return v.getUint16(e + 8, little) || 1;
      }
      return 1;
    }
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) break;
    off += 2 + len;
  }
  return 1;
}

// ---- Worker bridge -------------------------------------------------------

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (img: ImageData) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/process.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<ProcessResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if ('error' in e.data) p.reject(new Error(e.data.error));
    else {
      const { data, width, height } = e.data.img;
      p.resolve(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height));
    }
  };
  // If the worker crashes (e.g. out of memory on a phone), fail pending jobs and start fresh next time.
  const fail = () => {
    pending.forEach((p) => p.reject(new Error('Image processing stopped. The photo may be too large for this device.')));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  worker.onerror = fail;
  worker.onmessageerror = fail;
  return worker;
}

function runWorker(req: Omit<ProcessRequest, 'id'>): Promise<ImageData> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...req, id }, [req.img.data.buffer]);
  });
}

// ---- Page rendering ------------------------------------------------------

export interface RenderEdits {
  rotation: Rotation;
  crop?: Quad;
  filter: FilterId;
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  /** True when the photo was too big for this device and had to be scaled down. */
  limited: boolean;
}

/** Draws `img` rotated clockwise into a new canvas of the given (rotated) size. */
function drawRotated(img: Decoded, rotation: Rotation, cw: number, ch: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const [w, h] = rotation % 180 ? [ch, cw] : [cw, ch];
  if (rotation === 90) ctx.setTransform(0, 1, -1, 0, cw, 0);
  else if (rotation === 180) ctx.setTransform(-1, 0, 0, -1, cw, ch);
  else if (rotation === 270) ctx.setTransform(0, -1, 1, 0, 0, ch);
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

/**
 * Renders an image page with rotation, crop and filter applied.
 * `maxDim` limits the long side of the result (Infinity keeps full quality).
 */
export async function renderImagePage(blob: Blob, edits: RenderEdits, maxDim = Infinity): Promise<RenderResult> {
  const img = await decodeImage(blob);
  try {
    const { w, h } = sizeOf(img);
    const rw = edits.rotation % 180 ? h : w;
    const rh = edits.rotation % 180 ? w : h;
    const crop = isFullQuad(edits.crop) ? undefined : edits.crop;
    const target = crop ? quadOutputSize(scaleQuad(crop, rw, rh)) : { width: rw, height: rh };

    const fitScale = Math.min(1, maxDim / Math.max(target.width, target.height));
    const limitScale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (rw * rh)));
    const s = Math.min(fitScale, limitScale);
    const limited = limitScale < fitScale;

    const cw = Math.max(1, Math.round(rw * s));
    const ch = Math.max(1, Math.round(rh * s));
    const base = drawRotated(img, edits.rotation, cw, ch);
    // Free the decoded photo now; the canvas has everything we need (saves ~48 MB for 12 MP).
    release(img);
    if (!crop && edits.filter === 'original') return { canvas: base, limited };

    const data = base.getContext('2d')!.getImageData(0, 0, cw, ch);
    freeCanvas(base);
    const outW = crop ? Math.max(1, Math.round(target.width * s)) : cw;
    const outH = crop ? Math.max(1, Math.round(target.height * s)) : ch;
    const result = await runWorker({
      img: { data: data.data, width: cw, height: ch },
      quad: crop ? scaleQuad(crop, cw, ch) : undefined,
      outWidth: outW,
      outHeight: outH,
      filter: edits.filter,
    });
    const out = document.createElement('canvas');
    out.width = result.width;
    out.height = result.height;
    out.getContext('2d')!.putImageData(result, 0, 0);
    return { canvas: out, limited };
  } catch (e) {
    release(img);
    throw e;
  }
}

/** Pixel size of an image file after EXIF orientation. */
export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const img = await decodeImage(blob);
  const { w, h } = sizeOf(img);
  release(img);
  return { width: w, height: h };
}
