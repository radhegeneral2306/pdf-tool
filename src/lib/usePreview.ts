import { useEffect, useState } from 'react';
import type { PageItem } from '../types';
import { getBlob } from '../storage/db';
import { canvasToBlob, freeCanvas, renderImagePage, type RenderEdits } from './imageUtils';
import { renderPdfPage } from './pdfRender';
import { limit } from './thumbs';

async function toUrl(c: HTMLCanvasElement, q = 0.85) {
  const b = await canvasToBlob(c, 'image/jpeg', q);
  freeCanvas(c);
  return URL.createObjectURL(b);
}

/** Renders a preview image URL for the page with the given edits. Stale results are ignored. */
export function usePreview(page: PageItem | undefined, edits: RenderEdits | null, maxDim: number) {
  const [out, setOut] = useState<{ key: string; url: string; aspect: number } | null>(null);
  const key = page && edits ? JSON.stringify([page.id, edits, maxDim]) : '';
  useEffect(() => {
    if (!page || !edits) return;
    let alive = true;
    let made: string | null = null;
    // Queued (max 2 at once) so opening Filters doesn't decode 5 full photos together.
    limit(async () => {
      const blob = await getBlob(page.blobId);
      if (!blob || !alive) return;
      const canvas =
        page.kind === 'pdfPage'
          ? (await renderPdfPage(page.blobId, blob, page.pdfPageIndex ?? 0, edits.rotation, maxDim)).canvas
          : (await renderImagePage(blob, edits, maxDim)).canvas;
      const aspect = canvas.width / canvas.height;
      made = await toUrl(canvas);
      if (alive) setOut({ key, url: made, aspect });
      else URL.revokeObjectURL(made);
    }).catch(() => alive && setOut({ key, url: '', aspect: 1 }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => void (out?.url && URL.revokeObjectURL(out.url)), [out]);
  return out?.key === key ? out : null;
}

