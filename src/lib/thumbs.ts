import { useEffect, useState } from 'react';
import type { PageItem } from '../types';
import { getBlob, getThumb, putThumb } from '../storage/db';
import { canvasToBlob, freeCanvas, renderImagePage } from './imageUtils';
import { renderPdfPage } from './pdfRender';

const THUMB_DIM = 480;

/** Thumbnails are cached by everything that changes how the page looks. Starts with the blob id (for cleanup). */
export function thumbKey(p: PageItem): string {
  const crop = p.crop ? p.crop.map((c) => `${c.x.toFixed(4)},${c.y.toFixed(4)}`).join(';') : '';
  return [p.blobId, p.kind, p.pdfPageIndex ?? '', p.rotation, p.filter, crop].join('|');
}

const urls = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// Simple queue: at most two thumbnails render at once so phones stay responsive.
let running = 0;
const queue: (() => void)[] = [];
function limit<T>(job: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < 2) run();
    else queue.push(run);
  });
}

async function render(p: PageItem): Promise<Blob> {
  const blob = await getBlob(p.blobId);
  if (!blob) throw new Error('missing file');
  const canvas =
    p.kind === 'pdfPage'
      ? (await renderPdfPage(p.blobId, blob, p.pdfPageIndex ?? 0, p.rotation, THUMB_DIM)).canvas
      : (await renderImagePage(blob, p, THUMB_DIM)).canvas;
  const out = await canvasToBlob(canvas, 'image/jpeg', 0.8);
  freeCanvas(canvas);
  return out;
}

export function loadThumb(p: PageItem): Promise<string> {
  const key = thumbKey(p);
  const ready = urls.get(key);
  if (ready) return Promise.resolve(ready);
  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      let blob = await getThumb(key);
      if (!blob) {
        blob = await limit(() => render(p));
        putThumb(key, blob).catch(() => {});
      }
      const url = URL.createObjectURL(blob);
      urls.set(key, url);
      return url;
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

/** Object URL of a page thumbnail, `undefined` while rendering, `null` if it failed. */
export function useThumb(p: PageItem | undefined): string | null | undefined {
  const key = p ? thumbKey(p) : '';
  const [state, setState] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!p) return;
    let alive = true;
    loadThumb(p).then(
      (url) => alive && setState({ key, url }),
      () => alive && setState({ key, url: null }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!p) return null;
  return state?.key === key ? state.url : urls.get(key);
}
