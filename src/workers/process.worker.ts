/// <reference lib="webworker" />
import { applyFilter, type Img } from '../lib/filters';
import { warpPerspective } from '../lib/perspective';
import type { FilterId, Quad } from '../types';

export interface ProcessRequest {
  id: number;
  img: Img;
  /** Crop corners in pixel coordinates of `img`. */
  quad?: Quad;
  outWidth: number;
  outHeight: number;
  filter: FilterId;
}

export type ProcessResponse = { id: number; img: Img } | { id: number; error: string };

self.onmessage = (e: MessageEvent<ProcessRequest>) => {
  const { id, img, quad, outWidth, outHeight, filter } = e.data;
  try {
    let out = quad ? warpPerspective(img, quad, outWidth, outHeight) : img;
    out = applyFilter(out, filter);
    (self as unknown as Worker).postMessage({ id, img: out } satisfies ProcessResponse, [out.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies ProcessResponse);
  }
};
