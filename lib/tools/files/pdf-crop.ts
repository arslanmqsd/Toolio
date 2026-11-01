/**
 * Cropping PDF pages by setting their crop box, the area readers show and print. Like every PDF cropper,
 * this hides what's outside rather than deleting it: Redact PDF removes content for good.
 */

import { PDFDocument } from "pdf-lib";
import { seenToUser } from "./pdf-page-numbers";

/** How much to cut from each side, as a share (0–1) of the page's width or height as seen. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_CROP: Margins = { top: 0, right: 0, bottom: 0, left: 0 };

/** The smallest share of the page a crop may leave, so a page never shrinks to nothing. */
export const MIN_SHARE = 0.05;

export const isNoCrop = (m: Margins) => m.top === 0 && m.right === 0 && m.bottom === 0 && m.left === 0;

/** Keeps margins in range and at least MIN_SHARE of the page between opposite sides. */
export function clampMargins({ top, right, bottom, left }: Margins): Margins {
  const fit = (a: number, b: number): [number, number] => {
    [a, b] = [Math.max(0, a), Math.max(0, b)];
    const over = a + b - (1 - MIN_SHARE);
    // Shrink both sides in proportion when they leave too little between them.
    return over > 0 ? [a - (over * a) / (a + b), b - (over * b) / (a + b)] : [a, b];
  };
  const [t, b] = fit(top, bottom);
  const [l, r] = fit(left, right);
  return { top: t, right: r, bottom: b, left: l };
}

export interface PageCrop {
  /** Zero-based page. */
  page: number;
  margins: Margins;
}

/**
 * The same PDF with each listed page's crop box cut in by its margins, measured on the page as seen
 * (rotation applied). Pages not listed are unchanged. Edits in place, so links and bookmarks survive.
 */
export async function cropPages(input: Uint8Array, crops: PageCrop[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const pages = doc.getPages();
  for (const { page: index, margins } of crops) {
    const page = pages[index];
    const box = page.getCropBox();
    const rotation = page.getRotation().angle;
    const [w, h] = rotation % 180 ? [box.height, box.width] : [box.width, box.height];
    const m = clampMargins(margins);
    // Seen corners, origin bottom-left, turned back into the page's own coordinates.
    const a = seenToUser(box, rotation, [m.left * w, m.bottom * h]);
    const b = seenToUser(box, rotation, [(1 - m.right) * w, (1 - m.top) * h]);
    const [x1, x2] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y1, y2] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    page.setCropBox(x1, y1, x2 - x1, y2 - y1);
  }
  return doc.save({ useObjectStreams: true });
}

/** A pixel counts as blank paper when every channel is at least this light. */
const BLANK = 242;

/**
 * Margins that trim the blank paper round a page's content, from its RGBA pixels. Null for a blank page.
 * Near-white counts as blank, so scanner noise and faint edges don't stop the trim.
 */
export function contentMargins(pixels: Uint8ClampedArray, width: number, height: number): Margins | null {
  let [minX, minY, maxX, maxY] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // See-through pixels are blank too: pdf.js leaves no paper behind them.
      if (pixels[i + 3] < 16 || (pixels[i] >= BLANK && pixels[i + 1] >= BLANK && pixels[i + 2] >= BLANK)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { top: minY / height, right: (width - 1 - maxX) / width, bottom: (height - 1 - maxY) / height, left: minX / width };
}

/** Margins that keep everything both keep: the smaller cut on each side. */
export const unionMargins = (a: Margins, b: Margins): Margins => ({
  top: Math.min(a.top, b.top),
  right: Math.min(a.right, b.right),
  bottom: Math.min(a.bottom, b.bottom),
  left: Math.min(a.left, b.left),
});

/** Pulls each side back out by `pad` (a share of the page), never past the edge. */
export const padMargins = (m: Margins, pad: number): Margins => ({
  top: Math.max(0, m.top - pad),
  right: Math.max(0, m.right - pad),
  bottom: Math.max(0, m.bottom - pad),
  left: Math.max(0, m.left - pad),
});
