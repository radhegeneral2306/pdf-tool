import type { OutputSize, PageItem } from '../types';

/** How images are re-encoded. `maxDim: Infinity` keeps full resolution. */
export interface Level {
  maxDim: number;
  quality: number;
}

/** Quality used when an edited image must be re-encoded at "Original" size. */
export const ORIGINAL_QUALITY = 0.95;

export const PRESETS: Record<Exclude<OutputSize, 'original' | 'custom'>, Level> = {
  high: { maxDim: 2480, quality: 0.85 }, // A4 at 300 dpi
  medium: { maxDim: 1754, quality: 0.75 }, // A4 at 200 dpi
  small: { maxDim: 1240, quality: 0.6 }, // A4 at 150 dpi
};

/** Steps tried (best first) when the user asks for "under N MB". */
export const CUSTOM_LADDER: Level[] = [
  { maxDim: 2480, quality: 0.85 },
  { maxDim: 2200, quality: 0.8 },
  { maxDim: 1754, quality: 0.75 },
  { maxDim: 1500, quality: 0.7 },
  { maxDim: 1240, quality: 0.6 },
  { maxDim: 1000, quality: 0.55 },
  { maxDim: 850, quality: 0.5 },
  { maxDim: 700, quality: 0.45 },
];

/** Rough JPEG bytes per pixel for document photos at a given quality. */
const bytesPerPixel = (q: number) => 0.02 + 0.35 * q ** 3;

export function isEdited(p: PageItem): boolean {
  return p.filter !== 'original' || !!p.crop;
}

/**
 * Approximate output size in bytes, shown before exporting.
 * `blobSizes` maps blob id to the original file size.
 */
export function estimateBytes(
  pages: PageItem[],
  blobSizes: Map<string, number>,
  level: Level | null,
  compressPdfPages: boolean,
): number {
  let total = 1200;
  for (const p of pages) {
    const size = blobSizes.get(p.blobId) ?? 0;
    total += 600;
    if (p.kind === 'pdfPage') {
      if (level && compressPdfPages) total += level.maxDim * level.maxDim * 0.707 * bytesPerPixel(level.quality);
      else total += size / Math.max(1, p.pdfPageCount ?? 1);
      continue;
    }
    const w = p.width ?? 2000;
    const h = p.height ?? 2000;
    if (!level) {
      total += isEdited(p) ? Math.min(w * h * bytesPerPixel(ORIGINAL_QUALITY), size * 1.6) : size;
      continue;
    }
    const s = Math.min(1, level.maxDim / Math.max(w, h));
    total += Math.min(w * h * s * s * bytesPerPixel(level.quality), isEdited(p) ? Infinity : size);
  }
  return Math.round(total);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
