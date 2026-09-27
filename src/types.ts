export type FilterId = 'original' | 'clearScan' | 'bw' | 'color';
export type Rotation = 0 | 90 | 180 | 270;

/** A point in normalized coordinates (0..1) of the rotated image. */
export interface Point {
  x: number;
  y: number;
}

/** Crop corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface PageItem {
  id: string;
  kind: 'image' | 'pdfPage';
  /** Key of the original file in the blobs store. */
  blobId: string;
  /** Name of the file this page came from (shown while selecting pages). */
  sourceName?: string;
  /** Clockwise rotation chosen by the user, applied on top of the original. */
  rotation: Rotation;
  filter: FilterId;
  crop?: Quad;
  /** Image pages: pixel size of the original after EXIF orientation. */
  width?: number;
  height?: number;
  /** PDF pages: which page of the source PDF, and how many pages it has. */
  pdfPageIndex?: number;
  pdfPageCount?: number;
}

export interface Project {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pages: PageItem[];
}

export type ThemePref = 'system' | 'light' | 'dark';
export type PageSize = 'a4' | 'letter' | 'fit';
export type OutputSize = 'original' | 'high' | 'medium' | 'small' | 'custom';

export interface Settings {
  theme: ThemePref;
  scanFilter: FilterId;
  pageSize: PageSize;
  outputSize: OutputSize;
  welcomed: boolean;
  /** File names already exported, used to add (2), (3) on repeat exports. */
  exportedNames: string[];
}
