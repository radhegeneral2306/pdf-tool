import { describe, expect, it } from 'vitest';
import { acceptQuad, orderCorners, quadArea, quadDistance } from '../src/lib/quad';
import type { Quad } from '../src/types';

const page: Quad = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.15 },
  { x: 0.85, y: 0.9 },
  { x: 0.15, y: 0.85 },
];

describe('detected page corners', () => {
  it('orders any 4 points as TL, TR, BR, BL', () => {
    const shuffled = [page[2], page[0], page[3], page[1]];
    expect(orderCorners(shuffled)).toEqual(page);
  });
  it('computes area', () => {
    expect(quadArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeCloseTo(1);
  });
  it('accepts a sensible page', () => {
    expect(acceptQuad([page[3], page[1], page[0], page[2]] as Quad)).toEqual(page);
  });
  it('rejects tiny, full-frame, crossed and missing results', () => {
    const tiny: Quad = [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 0.4, y: 0.5 }];
    const full: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const line: Quad = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }, { x: 0.2, y: 0.2 }];
    expect(acceptQuad(tiny)).toBeNull();
    expect(acceptQuad(full)).toBeNull();
    expect(acceptQuad(line)).toBeNull();
    expect(acceptQuad(null)).toBeNull();
  });
  it('measures how far corners moved', () => {
    const moved = page.map((p) => ({ x: p.x + 0.03, y: p.y })) as Quad;
    expect(quadDistance(page, moved)).toBeCloseTo(0.03);
  });
});
