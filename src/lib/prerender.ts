import type { PageItem, Project } from '../types';
import { getBlob, getRender, putRender } from '../storage/db';
import { ORIGINAL_QUALITY, isEdited } from './compress';
import { canvasToBlob, freeCanvas, renderImagePage } from './imageUtils';
import { thumbKey } from './thumbs';

/**
 * Prepares edited photo pages at full quality in the background, one at a time,
 * while the user looks at the document. Save PDF then only has to put the pages
 * together, which is much faster on low-end phones. Output quality is unchanged:
 * it is exactly what Save PDF would have made.
 */

export const renderKey = (p: PageItem) => `${thumbKey(p)}|original`;

const needsPrep = (p: PageItem) => p.kind === 'image' && isEdited(p);

let queue: PageItem[] = [];
let keep = new Set<string>();
let running = false;
let paused = 0;
/** Pages being prepared right now, so Save PDF can wait for them instead of starting over. */
const inflight = new Map<string, Promise<Blob | null>>();
let wake: (() => void) | null = null;

function idle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 300);
  });
}

/** Waits while prerendering is paused or the app is in the background. */
async function waitUntilAllowed() {
  while (paused > 0 || document.hidden) {
    await new Promise<void>((resolve) => {
      wake = resolve;
      const onVis = () => {
        document.removeEventListener('visibilitychange', onVis);
        resolve();
      };
      document.addEventListener('visibilitychange', onVis);
    });
  }
}

/** Renders one page exactly like Save PDF at Original quality. */
export async function renderPageJpeg(p: PageItem, blob: Blob): Promise<Blob> {
  const { canvas } = await renderImagePage(blob, p, Infinity);
  try {
    return await canvasToBlob(canvas, 'image/jpeg', ORIGINAL_QUALITY);
  } finally {
    freeCanvas(canvas);
  }
}

async function prepare(p: PageItem): Promise<Blob | null> {
  const key = renderKey(p);
  const blob = await getBlob(p.blobId);
  if (!blob) return null;
  const jpeg = await renderPageJpeg(p, blob);
  await putRender(key, jpeg, keep).catch(() => {}); // storage full: just skip
  return jpeg;
}

async function loop() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      await waitUntilAllowed();
      await idle();
      const p = queue.shift();
      if (!p) break;
      const key = renderKey(p);
      if (inflight.has(key) || (await getRender(key))) continue;
      const job = prepare(p).catch(() => null);
      inflight.set(key, job);
      await job;
      inflight.delete(key);
    }
  } finally {
    running = false;
  }
}

/** Queues the document's edited photo pages that aren't prepared yet. */
export function prepareProject(project: Project) {
  const pages = project.pages.filter(needsPrep);
  keep = new Set(pages.map(renderKey));
  queue = pages;
  loop();
}

/** Stops preparing (e.g. when leaving the document). Finished pages stay saved. */
export function stopPreparing() {
  queue = [];
}

/** Pauses background work while something else heavy runs. Call the returned function to resume. */
export function pausePrerender(): () => void {
  paused++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    paused--;
    if (paused === 0) wake?.();
  };
}

/** A prepared page for Save PDF: finished, or the one being made right now. */
export async function preparedPage(p: PageItem): Promise<Blob | null> {
  const key = renderKey(p);
  return (await getRender(key).catch(() => undefined)) ?? (await inflight.get(key)) ?? null;
}

/** Saves a page Save PDF had to render itself, so the next export is instant too. */
export function rememberRender(p: PageItem, jpeg: Blob) {
  putRender(renderKey(p), jpeg, keep).catch(() => {});
}
