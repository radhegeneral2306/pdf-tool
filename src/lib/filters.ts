import type { FilterId } from '../types';

/** Plain RGBA pixel buffer. Same shape as ImageData, but usable in workers and tests. */
export interface Img {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface Grid {
  w: number;
  h: number;
  cell: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

/** Averages the image into cells roughly 1/160th of the long side. */
function meanGrid(img: Img): Grid {
  const W = img.width;
  const H = img.height;
  const cell = Math.max(2, Math.round(Math.max(W, H) / 160));
  const w = Math.ceil(W / cell);
  const h = Math.ceil(H / cell);
  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  const n = new Float32Array(w * h);
  const d = img.data;
  // Column -> cell index, so the inner loop has no division.
  const col = new Int32Array(W);
  for (let x = 0; x < W; x++) col[x] = (x / cell) | 0;
  // Per grid row, sum each cell's integer channel values (exact in Float64), then store once.
  const sr = new Float64Array(w);
  const sg = new Float64Array(w);
  const sb = new Float64Array(w);
  let i = 0;
  for (let gy = 0; gy < h; gy++) {
    const y0 = gy * cell;
    const y1 = Math.min(H, y0 + cell);
    sr.fill(0);
    sg.fill(0);
    sb.fill(0);
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < W; x++, i += 4) {
        const k = col[x];
        sr[k] += d[i];
        sg[k] += d[i + 1];
        sb[k] += d[i + 2];
      }
    const row = gy * w;
    for (let gx = 0; gx < w; gx++) {
      r[row + gx] = sr[gx];
      g[row + gx] = sg[gx];
      b[row + gx] = sb[gx];
      n[row + gx] = (y1 - y0) * (Math.min(W, (gx + 1) * cell) - gx * cell);
    }
  }
  for (let k = 0; k < n.length; k++) {
    r[k] /= n[k];
    g[k] /= n[k];
    b[k] /= n[k];
  }
  return { w, h, cell, r, g, b };
}

/** Separable max filter: brightest value in a (2*rad+1)^2 window. Removes dark text from the paper estimate. */
function maxFilter(a: Float32Array, w: number, h: number, rad: number): Float32Array {
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - rad); k <= Math.min(w - 1, x + rad); k++) m = Math.max(m, a[y * w + k]);
      tmp[y * w + x] = m;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - rad); k <= Math.min(h - 1, y + rad); k++) m = Math.max(m, tmp[k * w + x]);
      out[y * w + x] = m;
    }
  return out;
}

/** Separable box blur. */
function boxBlur(a: Float32Array, w: number, h: number, rad: number): Float32Array {
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = Math.max(0, x - rad); k <= Math.min(w - 1, x + rad); k++, n++) s += a[y * w + k];
      tmp[y * w + x] = s / n;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = Math.max(0, y - rad); k <= Math.min(h - 1, y + rad); k++, n++) s += tmp[k * w + x];
      out[y * w + x] = s / n;
    }
  return out;
}

/** Estimates the paper color at each cell (bright background with text removed). */
function paper(a: Float32Array, w: number, h: number): Float32Array {
  const bg = boxBlur(maxFilter(a, w, h, 3), w, h, 3);
  for (let k = 0; k < bg.length; k++) bg[k] = Math.max(bg[k], 40);
  return bg;
}

/**
 * Precomputed bilinear sampling coordinates along one axis: for pixel p the grid position
 * g = (p + 0.5) / cell - 0.5 clamped to [0, n - 1], split into i0, i1 = min(i0 + 1, n - 1), f = g - i0.
 * They depend only on the pixel's own coordinate, so they are computed once per image axis.
 */
interface Axis {
  i0: Int32Array;
  i1: Int32Array;
  f: Float64Array;
}

function axis(size: number, cell: number, n: number): Axis {
  const i0 = new Int32Array(size);
  const i1 = new Int32Array(size);
  const f = new Float64Array(size);
  for (let p = 0; p < size; p++) {
    let g = (p + 0.5) / cell - 0.5;
    if (g < 0) g = 0;
    else if (g > n - 1) g = n - 1;
    const a = g | 0;
    i0[p] = a;
    i1[p] = a + 1 < n ? a + 1 : n - 1;
    f[p] = g - a;
  }
  return { i0, i1, f };
}

/** Interpolates grid row `j` along x for every pixel column: out[x] = lerp(a[j][x0], a[j][x1], fx). */
function rowAlongX(out: Float64Array, a: Float32Array | Float64Array, j: number, w: number, ax: Axis) {
  const { i0, i1, f } = ax;
  const base = j * w;
  for (let x = 0; x < out.length; x++) {
    const v0 = a[base + i0[x]];
    out[x] = v0 + (a[base + i1[x]] - v0) * f[x];
  }
}

/**
 * Walks the image rows and keeps, for each grid, the x-interpolated grid rows y0 and y1 that the
 * current pixel row needs. Those only change every `cell` rows, so per pixel just the y lerp remains.
 * The arithmetic is the same as a direct bilinear lookup (x first, then y).
 */
class RowCache {
  top: Float64Array[];
  bot: Float64Array[];
  private j0 = -1;
  private j1 = -1;
  private grids: (Float32Array | Float64Array)[];
  private w: number;
  private ax: Axis;
  constructor(grids: (Float32Array | Float64Array)[], w: number, ax: Axis, width: number) {
    this.grids = grids;
    this.w = w;
    this.ax = ax;
    this.top = grids.map(() => new Float64Array(width));
    this.bot = grids.map(() => new Float64Array(width));
  }
  /** Makes top/bot hold grid rows y0/y1. */
  load(y0: number, y1: number) {
    if (y0 === this.j0 && y1 === this.j1) return;
    const { grids, w, ax } = this;
    for (let c = 0; c < grids.length; c++) {
      if (y0 === this.j1) {
        // Moving down one grid row: the old bottom row becomes the new top row.
        const t = this.top[c];
        this.top[c] = this.bot[c];
        this.bot[c] = t;
      } else rowAlongX(this.top[c], grids[c], y0, w, ax);
      if (y1 === y0) this.bot[c].set(this.top[c]);
      else rowAlongX(this.bot[c], grids[c], y1, w, ax);
    }
    this.j0 = y0;
    this.j1 = y1;
  }
}

/** Applies a scan filter to the image in place. */
export function applyFilter(img: Img, filter: FilterId): Img {
  if (filter === 'original') return img;
  const grid = meanGrid(img);
  const { w, h, cell } = grid;
  const bgR = paper(grid.r, w, h);
  const bgG = paper(grid.g, w, h);
  const bgB = paper(grid.b, w, h);
  const W = img.width;
  const H = img.height;
  const ax = axis(W, cell, w);
  const ay = axis(H, cell, h);
  const d = img.data;

  if (filter === 'bw') {
    // Shadow-free luminance per cell, then its local average is the threshold reference.
    const norm = new Float32Array(w * h);
    // Bilinear interpolation is linear, so the paper luminance is interpolated as one grid.
    const bgL = new Float64Array(w * h);
    for (let k = 0; k < norm.length; k++) {
      const lum = 0.299 * grid.r[k] + 0.587 * grid.g[k] + 0.114 * grid.b[k];
      const bg = 0.299 * bgR[k] + 0.587 * bgG[k] + 0.114 * bgB[k];
      bgL[k] = bg;
      norm[k] = Math.min(255, (lum / bg) * 255);
    }
    const local = boxBlur(norm, w, h, 4);
    const rows = new RowCache([bgL, local], w, ax, W);
    let i = 0;
    for (let y = 0; y < H; y++) {
      rows.load(ay.i0[y], ay.i1[y]);
      const fy = ay.f[y];
      const tB = rows.top[0], bB = rows.bot[0], tL = rows.top[1], bL = rows.bot[1];
      for (let x = 0; x < W; x++, i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const b0 = tB[x];
        const v = (lum / (b0 + (bB[x] - b0) * fy)) * 255;
        const l0 = tL[x];
        let t = (l0 + (bL[x] - l0) * fy) * 0.82;
        if (t > 215) t = 215;
        // Narrow soft edge keeps letters smooth instead of jagged.
        const o = v < t - 12 ? 0 : v > t + 12 ? 255 : ((v - (t - 12)) / 24) * 255;
        d[i] = d[i + 1] = d[i + 2] = o;
      }
    }
    return img;
  }

  const black = filter === 'clearScan' ? 40 : 25;
  const white = filter === 'clearScan' ? 232 : 240;
  const sat = filter === 'clearScan' ? 0.85 : 1.45;
  const range = white - black;
  const rows = new RowCache([bgR, bgG, bgB], w, ax, W);
  let i = 0;
  for (let y = 0; y < H; y++) {
    rows.load(ay.i0[y], ay.i1[y]);
    const fy = ay.f[y];
    const tR = rows.top[0], bR = rows.bot[0];
    const tG = rows.top[1], bG = rows.bot[1];
    const tB = rows.top[2], bB = rows.bot[2];
    for (let x = 0; x < W; x++, i += 4) {
      let p = tR[x];
      let r = (((d[i] / (p + (bR[x] - p) * fy)) * 255 - black) * 255) / range;
      p = tG[x];
      let g = (((d[i + 1] / (p + (bG[x] - p) * fy)) * 255 - black) * 255) / range;
      p = tB[x];
      let b = (((d[i + 2] / (p + (bB[x] - p) * fy)) * 255 - black) * 255) / range;
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      // Uint8ClampedArray clamps to 0..255 on store.
      d[i] = l + (r - l) * sat;
      d[i + 1] = l + (g - l) * sat;
      d[i + 2] = l + (b - l) * sat;
    }
  }
  return img;
}
