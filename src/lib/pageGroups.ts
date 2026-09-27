import type { PageItem } from '../types';

/** Page indexes where a new source file starts (so its name can be shown there). */
export function groupStarts(pages: PageItem[]): Set<number> {
  const out = new Set<number>();
  pages.forEach((p, i) => {
    if (p.sourceName && (i === 0 || pages[i - 1].blobId !== p.blobId)) out.add(i);
  });
  return out;
}
