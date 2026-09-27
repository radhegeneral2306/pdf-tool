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
  const cell = Math.max(2, Math.round(Math.max(img.width, img.height) / 160));
  const w = Math.ceil(img.width / cell);
  const h = Math.ceil(img.height / cell);
  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  const n = new Float32Array(w * h);
  const d = img.data;
  for (let y = 0; y < img.height; y++) {
    const row = ((y / cell) | 0) * w;
    for (let x = 0; x < img.width; x++) {
      const k = row + ((x / cell) | 0);
      const i = (y * img.width + x) * 4;
      r[k] += d[i];
      g[k] += d[i + 1];
      b[k] += d[i + 2];
      n[k]++;
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

/** Bilinear lookup of a grid value at pixel (x, y). */
function sampler(w: number, h: number, cell: number) {
  return (a: Float32Array, x: number, y: number) => {
    let gx = (x + 0.5) / cell - 0.5;
    let gy = (y + 0.5) / cell - 0.5;
    if (gx < 0) gx = 0;
    else if (gx > w - 1) gx = w - 1;
    if (gy < 0) gy = 0;
    else if (gy > h - 1) gy = h - 1;
    const x0 = gx | 0;
    const y0 = gy | 0;
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const fx = gx - x0;
    const fy = gy - y0;
    const top = a[y0 * w + x0] + (a[y0 * w + x1] - a[y0 * w + x0]) * fx;
    const bot = a[y1 * w + x0] + (a[y1 * w + x1] - a[y1 * w + x0]) * fx;
    return top + (bot - top) * fy;
  };
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const levels = (v: number, black: number, white: number) => clamp(((v - black) * 255) / (white - black));

/** Applies a scan filter to the image in place. */
export function applyFilter(img: Img, filter: FilterId): Img {
  if (filter === 'original') return img;
  const grid = meanGrid(img);
  const { w, h, cell } = grid;
  const bgR = paper(grid.r, w, h);
  const bgG = paper(grid.g, w, h);
  const bgB = paper(grid.b, w, h);
  const at = sampler(w, h, cell);
  const d = img.data;

  if (filter === 'bw') {
    // Shadow-free luminance per cell, then its local average is the threshold reference.
    const norm = new Float32Array(w * h);
    for (let k = 0; k < norm.length; k++) {
      const lum = 0.299 * grid.r[k] + 0.587 * grid.g[k] + 0.114 * grid.b[k];
      const bg = 0.299 * bgR[k] + 0.587 * bgG[k] + 0.114 * bgB[k];
      norm[k] = Math.min(255, (lum / bg) * 255);
    }
    const local = boxBlur(norm, w, h, 4);
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const bg = 0.299 * at(bgR, x, y) + 0.587 * at(bgG, x, y) + 0.114 * at(bgB, x, y);
        const v = (lum / bg) * 255;
        const t = Math.min(at(local, x, y) * 0.82, 215);
        // Narrow soft edge keeps letters smooth instead of jagged.
        const o = v < t - 12 ? 0 : v > t + 12 ? 255 : ((v - (t - 12)) / 24) * 255;
        d[i] = d[i + 1] = d[i + 2] = o;
      }
    return img;
  }

  const [black, white, sat] = filter === 'clearScan' ? [40, 232, 0.85] : [25, 240, 1.45];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      let r = levels((d[i] / at(bgR, x, y)) * 255, black, white);
      let g = levels((d[i + 1] / at(bgG, x, y)) * 255, black, white);
      let b = levels((d[i + 2] / at(bgB, x, y)) * 255, black, white);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
      d[i] = clamp(r);
      d[i + 1] = clamp(g);
      d[i + 2] = clamp(b);
    }
  return img;
}
