import { PDFDocument } from "pdf-lib";

/** The two formats a PDF can hold as they are; anything else is redrawn into one of them first. */
export type EmbeddableType = "jpg" | "png";

export type PageSize = "image" | "a4" | "letter";

/** Portrait width and height in points (1/72 inch). */
const PAPER: Record<Exclude<PageSize, "image">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/** Images carry no reliable print size, so "same as image" treats them as 96 pixels to the inch, like browsers do. */
const POINTS_PER_PIXEL = 72 / 96;

export interface ImageInput {
  bytes: Uint8Array;
  type: EmbeddableType;
}

export interface PageOptions {
  size: PageSize;
  /** Blank space around the image, in points. */
  margin: number;
}

export interface Placement {
  pageWidth: number;
  pageHeight: number;
  /** Where the image goes, from the page's bottom-left corner as PDF measures it. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ImagesProgress = { phase: "adding"; done: number; total: number } | { phase: "saving" };

/** JPEG or PNG from the file's first bytes, or null for anything else. File names and types can lie. */
export function sniffImage(bytes: Uint8Array): EmbeddableType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return png.every((b, i) => bytes[i] === b) ? "png" : null;
}

/**
 * The EXIF orientation (1–8) of a JPEG; 1, upright, when there's none. Phones save photos sideways and
 * set this tag instead of turning the pixels, and a PDF ignores it, so those photos need redrawing.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    // Start of scan: the metadata segments are over.
    if (marker === 0xda) break;
    const length = view.getUint16(at + 2);
    // APP1 holding "Exif\0\0".
    if (marker === 0xe1 && at + 10 <= bytes.length && view.getUint32(at + 4) === 0x45786966 && view.getUint16(at + 8) === 0) {
      const tiff = at + 10;
      const end = Math.min(at + 2 + length, bytes.length);
      if (tiff + 8 > end) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > end) return 1;
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > end) break;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    at += 2 + length;
  }
  return 1;
}

/**
 * Where an image of `width` × `height` pixels sits on its page. "image" makes the page fit the image;
 * paper sizes turn sideways for wide images, then scale the image to fill the space inside the margins.
 */
export function placeImage(width: number, height: number, { size, margin }: PageOptions): Placement {
  if (size === "image") {
    const w = width * POINTS_PER_PIXEL;
    const h = height * POINTS_PER_PIXEL;
    return { pageWidth: w + 2 * margin, pageHeight: h + 2 * margin, x: margin, y: margin, width: w, height: h };
  }
  const [short, long] = PAPER[size];
  const [pageWidth, pageHeight] = width > height ? [long, short] : [short, long];
  const scale = Math.min((pageWidth - 2 * margin) / width, (pageHeight - 2 * margin) / height);
  const w = width * scale;
  const h = height * scale;
  return { pageWidth, pageHeight, x: (pageWidth - w) / 2, y: (pageHeight - h) / 2, width: w, height: h };
}

/** A PDF with one page per image, in order. Throws on images pdf-lib can't read. */
export async function imagesToPdf(images: ImageInput[], options: PageOptions, onProgress: (progress: ImagesProgress) => void = () => {}): Promise<Uint8Array> {
  if (images.length === 0) throw new Error("Add at least one image.");
  const doc = await PDFDocument.create();
  for (const [i, { bytes, type }] of images.entries()) {
    onProgress({ phase: "adding", done: i, total: images.length });
    const image = type === "jpg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    const { pageWidth, pageHeight, ...box } = placeImage(image.width, image.height, options);
    doc.addPage([pageWidth, pageHeight]).drawImage(image, box);
  }
  onProgress({ phase: "saving" });
  return doc.save({ useObjectStreams: true });
}
