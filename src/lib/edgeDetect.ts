import type { Quad } from '../types';
import { acceptQuad, insetQuad } from './quad';
import { decodeImage } from './imageUtils';

/**
 * Automatic page-edge detection with OpenCV.js, running in a Web Worker.
 * Nothing is downloaded until warmUp() is called (when the scanner opens).
 * The service worker caches OpenCV after the first load, so it then works offline.
 */

type WorkerMsg =
  | { type: 'ready' }
  | { id: number; type: 'result'; quad: Quad | null; confidence: number; ms: number }
  | { id: number | null; type: 'error'; message: string };

export interface Detection {
  quad: Quad;
  confidence: number;
  ms: number;
}

let worker: Worker | null = null;
let ready: Promise<boolean> | null = null;
let seq = 0;
const pending = new Map<number, (r: Detection | null) => void>();

function reset() {
  pending.forEach((done) => done(null));
  pending.clear();
  worker?.terminate();
  worker = null;
  ready = null;
}

/** Starts loading OpenCV. Resolves false if it can't load (e.g. offline on first use). */
export function warmUp(): Promise<boolean> {
  if (ready) return ready;
  ready = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
      if (!ok) setTimeout(reset, 0); // allow a retry next time
    };
    // OpenCV is ~11 MB; allow time for a slow first download.
    const timer = setTimeout(() => finish(false), 60_000);
    try {
      // Bump ?v= when the worker or OpenCV changes: the service worker caches these files for a year.
      worker = new Worker(`${import.meta.env.BASE_URL}cv/detect-worker.js?v=1`);
    } catch {
      finish(false);
      return;
    }
    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      const m = e.data;
      if (m.type === 'ready') finish(true);
      else if (m.type === 'result') {
        const ok = acceptQuad(m.quad);
        const quad = ok && insetQuad(ok);
        pending.get(m.id)?.(quad ? { quad, confidence: m.confidence, ms: m.ms } : null);
        pending.delete(m.id);
      } else if (m.type === 'error') {
        if (m.id === null) finish(false);
        else {
          pending.get(m.id)?.(null);
          pending.delete(m.id);
        }
      }
    };
    worker.onerror = () => {
      finish(false);
      reset();
    };
  });
  return ready;
}

type Source = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | HTMLImageElement;

const sizeOf = (s: Source) =>
  s instanceof HTMLVideoElement
    ? { w: s.videoWidth, h: s.videoHeight }
    : s instanceof HTMLImageElement
      ? { w: s.naturalWidth, h: s.naturalHeight }
      : { w: s.width, h: s.height };

/**
 * Finds the page in an image/video frame. Works on a copy scaled to `maxDim`.
 * Returns null when OpenCV isn't available or no clear page was found.
 */
export async function detectQuad(source: Source, maxDim = 800): Promise<Detection | null> {
  if (!(await warmUp()) || !worker) return null;
  const { w, h } = sizeOf(source);
  if (!w || !h) return null;
  const s = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  c.width = c.height = 0;
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, 8000);
    pending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    worker!.postMessage({ id, type: 'detect', data: img.data.buffer, width: img.width, height: img.height }, [img.data.buffer]);
  });
}

/** Detects the page in a photo file (EXIF orientation applied). */
export async function detectInBlob(blob: Blob, maxDim = 800): Promise<Detection | null> {
  const img = await decodeImage(blob);
  try {
    return await detectQuad(img, maxDim);
  } finally {
    if (!(img instanceof HTMLImageElement)) img.close();
  }
}
