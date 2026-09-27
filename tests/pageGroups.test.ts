import { describe, expect, it } from 'vitest';
import { groupStarts } from '../src/lib/pageGroups';
import type { PageItem } from '../src/types';

const pg = (blobId: string, sourceName?: string): PageItem => ({ id: Math.random().toString(), kind: 'pdfPage', blobId, sourceName, rotation: 0, filter: 'original' });

describe('groupStarts', () => {
  it('marks the first page of each source file', () => {
    const pages = [pg('a', 'a.pdf'), pg('a', 'a.pdf'), pg('b', 'b.pdf'), pg('b', 'b.pdf'), pg('a', 'a.pdf')];
    expect([...groupStarts(pages)]).toEqual([0, 2, 4]);
  });
  it('skips pages without a file name (older documents, camera photos)', () => {
    expect([...groupStarts([pg('a'), pg('b')])]).toEqual([]);
  });
});
