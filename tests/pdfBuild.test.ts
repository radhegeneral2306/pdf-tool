import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream, degrees } from 'pdf-lib';
import { buildPdf, buildPdfUnder, passthrough, type BuildDeps } from '../src/lib/pdfBuild';
import { estimateBytes, PRESETS } from '../src/lib/compress';
import type { PageItem } from '../src/types';

// Minimal valid 1x1 JPEG.
const JPEG = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='),
  (c) => c.charCodeAt(0),
);

async function makePdf(pages: number, rotate = 0) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([300 + i, 400]).setRotation(degrees(rotate));
  return new Blob([(await d.save()) as BlobPart], { type: 'application/pdf' });
}

const IMG_BYTES = 200_000;

/** A PDF whose pages all reference ONE big (incompressible) image XObject. */
async function makeSharedImagePdf(pages: number) {
  const d = await PDFDocument.create();
  const data = new Uint8Array(IMG_BYTES);
  for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
  const stream = d.context.stream(data, {
    Type: 'XObject', Subtype: 'Image', Width: 400, Height: 500, ColorSpace: 'DeviceGray', BitsPerComponent: 8,
  });
  const ref = d.context.register(stream);
  for (let i = 0; i < pages; i++) d.addPage([300, 400]).node.setXObject(PDFName.of('Im0'), ref);
  return new Blob([(await d.save()) as BlobPart], { type: 'application/pdf' });
}

function bigStreams(doc: PDFDocument) {
  return doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.contents.length >= IMG_BYTES).length;
}

function deps(blobs: Record<string, Blob>, calls: string[] = []): BuildDeps {
  return {
    getBlob: async (id) => blobs[id],
    encodeImage: async (p, _b, level) => {
      calls.push(`encode:${p.id}:${level?.maxDim ?? 'full'}`);
      return { bytes: JPEG, format: 'jpg', rotation: 0 };
    },
    rasterizePdfPage: async (p) => {
      calls.push(`raster:${p.id}`);
      return { bytes: JPEG, widthPt: 100, heightPt: 200 };
    },
  };
}

const img = (id: string, extra: Partial<PageItem> = {}): PageItem => ({
  id, kind: 'image', blobId: 'jpg', rotation: 0, filter: 'original', width: 1, height: 1, ...extra,
});
const pdfPage = (id: string, blobId: string, idx: number, count: number, extra: Partial<PageItem> = {}): PageItem => ({
  id, kind: 'pdfPage', blobId, pdfPageIndex: idx, pdfPageCount: count, rotation: 0, filter: 'original', ...extra,
});

describe('buildPdf', () => {
  it('merges two PDFs and a photo in the chosen order', async () => {
    const blobs = { a: await makePdf(2), b: await makePdf(3), jpg: new Blob([JPEG]) };
    const pages = [pdfPage('b2', 'b', 2, 3), img('p'), pdfPage('a0', 'a', 0, 2), pdfPage('b0', 'b', 0, 3, { rotation: 90 })];
    const out = await PDFDocument.load(await buildPdf(pages, { pageSize: 'a4', margins: false, level: null, compressPdfPages: false }, deps(blobs)));
    expect(out.getPageCount()).toBe(4);
    expect(out.getPage(0).getWidth()).toBe(302);
    expect(Math.round(out.getPage(1).getWidth())).toBe(595);
    expect(out.getPage(2).getWidth()).toBe(300);
    expect(out.getPage(3).getRotation().angle).toBe(90);
  });

  it('keeps resources shared across pages of the same source only once', async () => {
    const src = await makeSharedImagePdf(10);
    const pages = Array.from({ length: 10 }, (_, i) => pdfPage(`s${i}`, 's', i, 10));
    const bytes = await buildPdf(pages, { pageSize: 'a4', margins: false, level: null, compressPdfPages: false }, deps({ s: src }));
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(10);
    expect(bigStreams(out)).toBe(1);
    expect(bytes.byteLength).toBeLessThan(IMG_BYTES * 1.5);
  });

  it('turns the same source page used twice into two separate pages', async () => {
    const blobs = { a: await makePdf(2), s: await makeSharedImagePdf(1) };
    const pages = [pdfPage('x', 'a', 1, 2), pdfPage('y', 'a', 1, 2, { rotation: 90 }), pdfPage('z', 's', 0, 1), pdfPage('w', 's', 0, 1)];
    const bytes = await buildPdf(pages, { pageSize: 'a4', margins: false, level: null, compressPdfPages: false }, deps(blobs));
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(4);
    expect(out.getPage(0).ref).not.toEqual(out.getPage(1).ref);
    expect(out.getPage(0).getWidth()).toBe(301);
    expect(out.getPage(0).getRotation().angle).toBe(0);
    expect(out.getPage(1).getWidth()).toBe(301);
    expect(out.getPage(1).getRotation().angle).toBe(90);
    expect(bigStreams(out)).toBe(1);
  });

  it('reports progress after each page', async () => {
    const seen: string[] = [];
    const blobs = { a: await makePdf(2), jpg: new Blob([JPEG]) };
    await buildPdf([pdfPage('x', 'a', 0, 2), img('p'), pdfPage('y', 'a', 1, 2)], { pageSize: 'a4', margins: false, level: null, compressPdfPages: false }, deps(blobs), (d, t) => seen.push(`${d}/${t}`));
    expect(seen).toEqual(['1/3', '2/3', '3/3']);
  });

  it('embeds untouched photos byte for byte at Original quality', async () => {
    const calls: string[] = [];
    const bytes = await buildPdf([img('p')], { pageSize: 'fit', margins: false, level: null, compressPdfPages: false }, deps({ jpg: new Blob([JPEG]) }, calls));
    expect(calls).toEqual([]);
    expect(Buffer.from(bytes).includes(Buffer.from(JPEG))).toBe(true);
    expect(passthrough(img('p', { rotation: 90 }), JPEG, null)?.rotation).toBe(90);
  });

  it('re-encodes edited photos and downsized exports', async () => {
    const calls: string[] = [];
    const d = deps({ jpg: new Blob([JPEG]) }, calls);
    await buildPdf([img('e', { filter: 'bw' })], { pageSize: 'a4', margins: true, level: null, compressPdfPages: false }, d);
    await buildPdf([img('s')], { pageSize: 'a4', margins: false, level: PRESETS.small, compressPdfPages: false }, d);
    expect(calls).toEqual(['encode:e:full', 'encode:s:1240']);
  });

  it('only rasterizes PDF pages when asked', async () => {
    const calls: string[] = [];
    const blobs = { a: await makePdf(1) };
    await buildPdf([pdfPage('x', 'a', 0, 1)], { pageSize: 'a4', margins: false, level: PRESETS.small, compressPdfPages: false }, deps(blobs, calls));
    await buildPdf([pdfPage('y', 'a', 0, 1)], { pageSize: 'a4', margins: false, level: PRESETS.small, compressPdfPages: true }, deps(blobs, calls));
    expect(calls).toEqual(['raster:y']);
  });

  it('target size search reports when it cannot fit', async () => {
    const r = await buildPdfUnder([img('p')], 10, { pageSize: 'a4', margins: false, compressPdfPages: false }, deps({ jpg: new Blob([JPEG]) }));
    expect(r.fits).toBe(false);
    const ok = await buildPdfUnder([img('p')], 1_000_000, { pageSize: 'a4', margins: false, compressPdfPages: false }, deps({ jpg: new Blob([JPEG]) }));
    expect(ok.fits).toBe(true);
  });
});

describe('extract pages (split)', () => {
  it('builds a PDF from only the chosen pages, in order', async () => {
    const blobs = { s: await makePdf(3) };
    const chosen = [pdfPage('p0', 's', 0, 3), pdfPage('p2', 's', 2, 3)];
    const out = await PDFDocument.load(await buildPdf(chosen, { pageSize: 'a4', margins: false, level: null, compressPdfPages: false }, deps(blobs)));
    expect(out.getPageCount()).toBe(2);
    expect(out.getPages().map((p) => p.getWidth())).toEqual([300, 302]);
  });
});

describe('estimateBytes', () => {
  it('gets smaller with each preset', () => {
    const pages = [img('a', { width: 4000, height: 3000, blobId: 'x' })];
    const sizes = new Map([['x', 4_000_000]]);
    const orig = estimateBytes(pages, sizes, null, false);
    const high = estimateBytes(pages, sizes, PRESETS.high, false);
    const med = estimateBytes(pages, sizes, PRESETS.medium, false);
    const small = estimateBytes(pages, sizes, PRESETS.small, false);
    expect(orig).toBeGreaterThan(high);
    expect(high).toBeGreaterThan(med);
    expect(med).toBeGreaterThan(small);
  });
});
