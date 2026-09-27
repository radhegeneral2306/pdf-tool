import { dateName } from './fileName';

/** Pure helpers for the OCR screen (kept separate so they can be unit tested). */

export type OcrLang = 'eng' | 'hin' | 'eng+hin';
export type OcrCleanup = 'off' | 'enhance' | 'bw';

export interface OcrPageResult {
  /** 1-based page number in the whole job. */
  page: number;
  /** Where the page came from, e.g. "bill.pdf, page 2" or "photo.jpg". */
  label: string;
  text: string;
  error?: string;
}

/** PDFs with more pages than this get a "this will be slow" warning first. */
export const MANY_PAGES = 20;

export const shouldWarn = (pages: number) => pages > MANY_PAGES;

export function pageSeparator(r: Pick<OcrPageResult, 'page' | 'label'>): string {
  return `——— Page ${r.page} (${r.label}) ———`;
}

/** All pages as one editable text, with a separator line before each page. */
export function joinPages(results: OcrPageResult[]): string {
  if (results.length === 1 && !results[0].error) return results[0].text.trim();
  return results
    .map((r) => `${pageSeparator(r)}\n${r.error ? `[Could not read this page: ${r.error}]` : r.text.trim()}`)
    .join('\n\n');
}

export function wordCount(text: string): number {
  const t = text.replace(/———[^\n]*———/g, ' ').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function ocrFileName(ext: 'txt' | 'pdf', d = new Date()): string {
  return `OCR ${dateName(d)}.${ext}`;
}

/** Turns technical errors into a message a person can act on. */
export function friendlyOcrError(e: unknown): string {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/memory|RangeError|allocation|OOM/i.test(msg)) return 'The phone ran out of memory. Try fewer pages at a time.';
  if (/fetch|network|Failed to load|NetworkError|load/i.test(msg))
    return 'The OCR files could not be downloaded. Connect to the internet once, then OCR works offline.';
  if (/format|decode|supported/i.test(msg)) return 'This file type is not supported. Use JPEG, PNG or PDF.';
  return 'OCR failed on this page.';
}
