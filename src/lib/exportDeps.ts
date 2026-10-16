import type { BuildDeps } from './pdfBuild';
import { canvasToBlob, freeCanvas, renderImagePage } from './imageUtils';
import { renderPdfPage } from './pdfRender';
import { getBlob } from '../storage/db';
import { preparedPage, rememberRender, renderPageJpeg } from './prerender';

async function toBytes(c: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await canvasToBlob(c, 'image/jpeg', quality);
  freeCanvas(c);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Real browser implementations used when exporting. */
export const browserDeps: BuildDeps = {
  async getBlob(id) {
    const b = await getBlob(id);
    if (!b) throw new Error('A file for this document is missing. Try removing and adding it again.');
    return b;
  },
  async encodeImage(page, blob, level) {
    if (!level) {
      // Original quality: use the page prepared in the background if it's ready.
      const ready = await preparedPage(page);
      const jpeg = ready ?? (await renderPageJpeg(page, blob));
      if (!ready) rememberRender(page, jpeg);
      return { bytes: new Uint8Array(await jpeg.arrayBuffer()), format: 'jpg', rotation: 0 };
    }
    const { canvas } = await renderImagePage(blob, page, level.maxDim);
    return { bytes: await toBytes(canvas, level.quality), format: 'jpg', rotation: 0 };
  },
  async rasterizePdfPage(page, blob, level) {
    const r = await renderPdfPage(page.blobId, blob, page.pdfPageIndex ?? 0, page.rotation, level.maxDim);
    return { bytes: await toBytes(r.canvas, level.quality), widthPt: r.widthPt, heightPt: r.heightPt };
  },
};
