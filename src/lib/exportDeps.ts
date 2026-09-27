import type { BuildDeps } from './pdfBuild';
import { ORIGINAL_QUALITY } from './compress';
import { canvasToBlob, freeCanvas, renderImagePage } from './imageUtils';
import { renderPdfPage } from './pdfRender';
import { getBlob } from '../storage/db';

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
    const { canvas } = await renderImagePage(blob, page, level?.maxDim ?? Infinity);
    return { bytes: await toBytes(canvas, level?.quality ?? ORIGINAL_QUALITY), format: 'jpg', rotation: 0 };
  },
  async rasterizePdfPage(page, blob, level) {
    const r = await renderPdfPage(page.blobId, blob, page.pdfPageIndex ?? 0, page.rotation, level.maxDim);
    return { bytes: await toBytes(r.canvas, level.quality), widthPt: r.widthPt, heightPt: r.heightPt };
  },
};
