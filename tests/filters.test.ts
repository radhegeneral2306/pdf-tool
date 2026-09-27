import { describe, expect, it } from 'vitest';
import { applyFilter, type Img } from '../src/lib/filters';

/** Grey paper with a shadow gradient and a dark "text" bar in the middle. */
function page(): Img {
  const width = 200, height = 200;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const paper = 200 - x * 0.4; // shadow gets darker to the right
      const text = y > 95 && y < 105 && x > 40 && x < 160;
      const v = text ? 40 : paper;
      data[i] = v; data[i + 1] = v; data[i + 2] = v * 0.95; data[i + 3] = 255;
    }
  return { data, width, height };
}
const px = (img: Img, x: number, y: number) => img.data[(y * img.width + x) * 4];

describe('filters', () => {
  it('original leaves pixels untouched', () => {
    const a = page();
    const before = Array.from(a.data);
    expect(Array.from(applyFilter(a, 'original').data)).toEqual(before);
  });
  it('clear scan whitens shadowed paper and keeps text dark', () => {
    const img = applyFilter(page(), 'clearScan');
    expect(px(img, 10, 20)).toBeGreaterThan(235);
    expect(px(img, 190, 20)).toBeGreaterThan(235); // shadow side is white too
    expect(px(img, 100, 100)).toBeLessThan(80);
  });
  it('black and white gives pure black text on white', () => {
    const img = applyFilter(page(), 'bw');
    expect(px(img, 190, 20)).toBe(255);
    expect(px(img, 100, 100)).toBe(0);
  });
  it('color keeps alpha', () => {
    const img = applyFilter(page(), 'color');
    expect(img.data[3]).toBe(255);
  });
});
