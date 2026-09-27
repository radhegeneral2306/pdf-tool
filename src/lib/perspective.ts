import type { Point, Quad, Rotation } from '../types';
import type { Img } from './filters';

/**
 * Solves the 3x3 homography H (h33 = 1) that maps each `from[i]` to `to[i]`.
 * Returned row-major as 9 numbers.
 */
export function homography(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let best = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[best][c])) best = r;
    [A[c], A[best]] = [A[best], A[c]];
    const p = A[c][c];
    if (Math.abs(p) < 1e-12) throw new Error('Crop corners are invalid');
    for (let k = c; k < 9; k++) A[c][k] /= p;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f === 0) continue;
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row) => row[8]), 1];
}

export function applyH(h: number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size of a straightened crop, from the average lengths of opposite edges (in pixels). */
export function quadOutputSize(q: Quad): { width: number; height: number } {
  const width = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const height = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

export function scaleQuad(q: Quad, sx: number, sy: number): Quad {
  return q.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad;
}

/** True when the crop is (almost) the whole image, so no warp is needed. */
export function isFullQuad(q?: Quad): boolean {
  if (!q) return true;
  const full = FULL_QUAD;
  return q.every((p, i) => Math.abs(p.x - full[i].x) < 0.002 && Math.abs(p.y - full[i].y) < 0.002);
}

export const FULL_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Rotates a normalized crop by 90 degree steps clockwise, keeping corner roles (TL, TR, BR, BL). */
export function rotateQuad(q: Quad, deltaCw: Rotation): Quad {
  let out = q;
  for (let i = 0; i < deltaCw / 90; i++) {
    const f = (p: Point): Point => ({ x: 1 - p.y, y: p.x });
    out = [f(out[3]), f(out[0]), f(out[1]), f(out[2])];
  }
  return out;
}

/**
 * Straightens the area inside `quad` (pixel coordinates of `src`) into a
 * width x height rectangle using bilinear sampling.
 */
export function warpPerspective(src: Img, quad: Quad, width: number, height: number): Img {
  const rect: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const h = homography(rect, quad);
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width;
  const sh = src.height;
  const s = src.data;
  let o = 0;
  for (let y = 0; y < height; y++) {
    const py = y + 0.5;
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const w = h[6] * px + h[7] * py + h[8];
      let sx = (h[0] * px + h[1] * py + h[2]) / w - 0.5;
      let sy = (h[3] * px + h[4] * py + h[5]) / w - 0.5;
      if (sx < 0) sx = 0;
      else if (sx > sw - 1) sx = sw - 1;
      if (sy < 0) sy = 0;
      else if (sy > sh - 1) sy = sh - 1;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0;
      const y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 4; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx;
        const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
        out[o++] = top + (bot - top) * fy;
      }
    }
  }
  return { data: out, width, height };
}

/** False when corners cross over each other (the crop would be twisted). */
export function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
