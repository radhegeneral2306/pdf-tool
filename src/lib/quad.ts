import type { Point, Quad } from '../types';
import { isConvex } from './perspective';

/** Orders 4 points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts: Point[]): Quad {
  const by = (f: (p: Point) => number, pick: 'min' | 'max') =>
    pts.reduce((best, p) => ((pick === 'min' ? f(p) < f(best) : f(p) > f(best)) ? p : best));
  return [
    by((p) => p.x + p.y, 'min'),
    by((p) => p.y - p.x, 'min'),
    by((p) => p.x + p.y, 'max'),
    by((p) => p.y - p.x, 'max'),
  ];
}

/** Shoelace area of a normalized quad (0..1). */
export function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Accepts a detected page only if it is a clean shape covering a sensible part of the photo:
 * at least 15% (smaller is usually noise) and at most 97% (that is just the photo border).
 */
export function acceptQuad(q: Quad | null | undefined): Quad | null {
  if (!q || q.length !== 4) return null;
  const clamped = q.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })) as Quad;
  const ordered = orderCorners(clamped);
  if (new Set(ordered).size !== 4 || !isConvex(ordered)) return null;
  // A box hugging all four photo edges is just the frame border (e.g. a plain wall), not a page.
  const e = 0.03;
  const [tl, tr, br, bl] = ordered;
  if (tl.x < e && tl.y < e && tr.x > 1 - e && tr.y < e && br.x > 1 - e && br.y > 1 - e && bl.x < e && bl.y > 1 - e) return null;
  const area = quadArea(ordered);
  return area >= 0.15 && area <= 0.97 ? ordered : null;
}

/** Moves each corner slightly towards the centre, so no thin strip of background shows at the page edge. */
export function insetQuad(q: Quad, amount = 0.006): Quad {
  const cx = q.reduce((a, p) => a + p.x, 0) / 4;
  const cy = q.reduce((a, p) => a + p.y, 0) / 4;
  return q.map((p) => {
    const d = Math.hypot(cx - p.x, cy - p.y) || 1;
    return { x: p.x + ((cx - p.x) / d) * amount, y: p.y + ((cy - p.y) / d) * amount };
  }) as Quad;
}

/** Largest corner movement between two quads (used to avoid a jittery live outline). */
export function quadDistance(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
}
