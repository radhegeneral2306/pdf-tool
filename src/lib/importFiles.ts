import { PDFDocument } from 'pdf-lib';
import type { FilterId, PageItem } from '../types';
import { putBlob, uid } from '../storage/db';
import { imageSize } from './imageUtils';

export interface ImportResult {
  pages: PageItem[];
  errors: string[];
}

const nameOf = (f: Blob) => (f instanceof File && f.name ? `"${f.name}"` : 'This file');

async function isPdf(f: Blob) {
  if (f.type === 'application/pdf' || (f instanceof File && /\.pdf$/i.test(f.name))) return true;
  const head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

/**
 * Stores files on the device and turns them into pages.
 * Originals are kept byte for byte, nothing is downsized.
 */
export async function importFiles(files: Blob[], imageFilter: FilterId): Promise<ImportResult> {
  const pages: PageItem[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (await isPdf(f)) {
      let count: number;
      try {
        const doc = await PDFDocument.load(await f.arrayBuffer(), { updateMetadata: false });
        count = doc.getPageCount();
      } catch (e) {
        const encrypted = e instanceof Error && /encrypt/i.test(e.message + e.name);
        errors.push(
          encrypted
            ? `${nameOf(f)} is password protected. Remove the password first, then add it again.`
            : `${nameOf(f)} could not be opened. The PDF may be damaged.`,
        );
        continue;
      }
      if (count === 0) {
        errors.push(`${nameOf(f)} has no pages.`);
        continue;
      }
      const blobId = await putBlob(f);
      for (let i = 0; i < count; i++)
        pages.push({ id: uid(), kind: 'pdfPage', blobId, pdfPageIndex: i, pdfPageCount: count, rotation: 0, filter: 'original' });
      continue;
    }
    try {
      const { width, height } = await imageSize(f);
      const blobId = await putBlob(f);
      pages.push({ id: uid(), kind: 'image', blobId, width, height, rotation: 0, filter: imageFilter });
    } catch {
      const heic = /hei[cf]/i.test(f.type) || (f instanceof File && /\.hei[cf]$/i.test(f.name));
      errors.push(
        heic
          ? `${nameOf(f)} is a HEIC photo, which this browser can't open. Share it as JPEG instead.`
          : `${nameOf(f)} is not a supported image or PDF.`,
      );
    }
  }
  return { pages, errors };
}
