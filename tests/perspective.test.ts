import { describe, expect, it } from 'vitest';
import { applyH, homography, quadOutputSize, rotateQuad, warpPerspective, FULL_QUAD, isFullQuad } from '../src/lib/perspective';
import type { Quad } from '../src/types';

describe('perspective', () => {
  it('maps the four corners exactly', () => {
    const from = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
    const to = [{ x: 10, y: 5 }, { x: 90, y: 12 }, { x: 95, y: 70 }, { x: 3, y: 60 }];
    const h = homography(from, to);
    from.forEach((p, i) => {
      const q = applyH(h, p);
      expect(q.x).toBeCloseTo(to[i].x, 6);
      expect(q.y).toBeCloseTo(to[i].y, 6);
    });
  });
  it('computes straightened size from edge lengths', () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];
    expect(quadOutputSize(q)).toEqual({ width: 200, height: 100 });
  });
  it('warping the full rectangle keeps pixels', () => {
    const w = 4, h = 3;
    const data = new Uint8ClampedArray(w * h * 4).map((_, i) => (i * 7) % 256);
    const q: Quad = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    const out = warpPerspective({ data, width: w, height: h }, q, w, h);
    expect(Array.from(out.data)).toEqual(Array.from(data));
  });
  it('rotating a crop 4 times returns the original', () => {
    const q: Quad = [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.2, y: 0.7 }];
    let r = q;
    for (let i = 0; i < 4; i++) r = rotateQuad(r, 90);
    r.forEach((p, i) => {
      expect(p.x).toBeCloseTo(q[i].x);
      expect(p.y).toBeCloseTo(q[i].y);
    });
    // one clockwise turn: old bottom-left becomes the new top-left
    const once = rotateQuad(FULL_QUAD, 90);
    expect(isFullQuad(once)).toBe(true);
  });
});
