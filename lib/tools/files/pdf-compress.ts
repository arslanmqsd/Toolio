import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFObject } from "pdf-lib";

export interface CompressLevel {
  /** JPEG quality, 0–1. */
  quality: number;
  /** Longest side an image is scaled down to, in pixels. */
  maxSide: number;
}

export const LEVELS = {
  light: { quality: 0.8, maxSide: 2400 },
  medium: { quality: 0.65, maxSide: 1600 },
  strong: { quality: 0.45, maxSide: 1100 },
} satisfies Record<string, CompressLevel>;

export type LevelId = keyof typeof LEVELS;

/** Re-encodes a JPEG, scaled to fit `width`×`height`. Returns null when it can't decode it. */
export type JpegEncoder = (
  jpeg: Uint8Array,
  target: { width: number; height: number; quality: number },
) => Promise<Uint8Array | null>;

export interface CompressResult {
  bytes: Uint8Array;
  images: number;
  recompressed: number;
}

const name = (dict: PDFDict, key: string) => dict.get(PDFName.of(key));
const num = (obj: PDFObject | undefined) => (obj instanceof PDFNumber ? obj.asNumber() : 0);

/** A JPEG image whose colours survive a round trip through a canvas, which only outputs RGB. */
function isSafeJpeg(stream: PDFRawStream, resolve: (o: PDFObject | undefined) => PDFObject | undefined): boolean {
  const d = stream.dict;
  const filter = resolve(name(d, "Filter"));
  const isDct = filter === PDFName.of("DCTDecode") || (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === PDFName.of("DCTDecode"));
  if (!isDct || num(resolve(name(d, "BitsPerComponent"))) !== 8) return false;
  // Decode arrays and colour-key masks depend on the exact sample values, which re-encoding changes.
  if (name(d, "Decode") || name(d, "Mask") || name(d, "ImageMask")) return false;

  const cs = resolve(name(d, "ColorSpace"));
  if (cs === PDFName.of("DeviceRGB") || cs === PDFName.of("DeviceGray")) return true;
  // CMYK, Lab and the rest would need colour conversion; ICC-based RGB or grey is close enough as plain RGB.
  if (cs instanceof PDFArray && cs.get(0) === PDFName.of("ICCBased")) {
    const profile = resolve(cs.get(1));
    return profile instanceof PDFRawStream && [1, 3].includes(num(resolve(name(profile.dict, "N"))));
  }
  return false;
}

/**
 * Shrinks a PDF by re-encoding its JPEG images at lower quality and size, and repacking objects into
 * compressed object streams. Text and vector graphics are untouched. Throws on encrypted or broken files.
 *
 * shortcut: only JPEG images are recompressed; Flate (PNG-like) images and fonts are left as they are,
 * add a raw-pixel encoder if Word/PowerPoint exports with PNG screenshots don't shrink enough.
 */
export async function compressPdf(input: Uint8Array, level: CompressLevel, encode: JpegEncoder): Promise<CompressResult> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const { context } = doc;
  const resolve = (o: PDFObject | undefined) => (o ? context.lookup(o) : undefined);
  let images = 0;
  let recompressed = 0;

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || name(obj.dict, "Subtype") !== PDFName.of("Image")) continue;
    images++;
    if (!isSafeJpeg(obj, resolve)) continue;

    const width = num(resolve(name(obj.dict, "Width")));
    const height = num(resolve(name(obj.dict, "Height")));
    if (!width || !height) continue;
    const scale = Math.min(1, level.maxSide / Math.max(width, height));
    const target = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: level.quality };

    const jpeg = await encode(obj.contents, target);
    if (!jpeg || jpeg.length >= obj.contents.length) continue;

    const dict = obj.dict.clone(context);
    dict.set(PDFName.of("Width"), PDFNumber.of(target.width));
    dict.set(PDFName.of("Height"), PDFNumber.of(target.height));
    dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
    dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
    dict.delete(PDFName.of("DecodeParms"));
    context.assign(ref, PDFRawStream.of(dict, jpeg));
    recompressed++;
  }

  const saved = await doc.save({ useObjectStreams: true });
  // Repacking can occasionally grow a file that was already tightly packed; never hand back a bigger one.
  return { bytes: saved.length < input.length ? saved : input, images, recompressed };
}

/** Browser encoder: decodes with createImageBitmap and re-encodes on an OffscreenCanvas. */
export const browserJpegEncoder: JpegEncoder = async (jpeg, { width, height, quality }) => {
  try {
    const bitmap = await createImageBitmap(new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    });
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG has no transparency; a white backdrop matches how the page shows it.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
};
