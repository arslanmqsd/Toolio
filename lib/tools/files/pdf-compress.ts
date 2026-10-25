import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream, type PDFObject, type PDFRef } from "pdf-lib";

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

/** An image to re-encode: JPEG bytes as stored, or decoded RGBA pixels from a PNG-style (Flate) image. */
export type ImageSource = { kind: "jpeg"; bytes: Uint8Array } | { kind: "pixels"; rgba: Uint8ClampedArray; width: number; height: number };

/** Re-encodes an image as JPEG, scaled to `width`×`height`. Returns null when it can't. */
export type ImageEncoder = (source: ImageSource, target: { width: number; height: number; quality: number }) => Promise<Uint8Array | null>;

/** Where compression has got to, for a progress bar. */
export type CompressProgress = { phase: "reading" } | { phase: "images"; done: number; total: number } | { phase: "saving" };

export interface CompressResult {
  bytes: Uint8Array;
  images: number;
  recompressed: number;
}

type Resolve = (o: PDFObject | undefined) => PDFObject | undefined;

const name = (dict: PDFDict, key: string) => dict.get(PDFName.of(key));
const num = (obj: PDFObject | undefined) => (obj instanceof PDFNumber ? obj.asNumber() : 0);

/** Filters pdf-lib can undo. DCTDecode (JPEG) is handled separately. */
const LOSSLESS_FILTERS = ["FlateDecode", "LZWDecode", "ASCII85Decode", "ASCIIHexDecode", "RunLengthDecode"].map((f) => PDFName.of(f));
/** Skip images that would need more than this much memory to decode (about 400 MB as RGBA). */
const MAX_PIXELS = 100_000_000;

/** 1 for grey, 3 for RGB, or 0 for colour spaces a canvas can't round-trip (CMYK, Lab, indexed…). */
function colourComponents(dict: PDFDict, resolve: Resolve): 0 | 1 | 3 {
  const cs = resolve(name(dict, "ColorSpace"));
  if (cs === PDFName.of("DeviceRGB")) return 3;
  if (cs === PDFName.of("DeviceGray")) return 1;
  // ICC-based RGB or grey is close enough as plain RGB.
  if (cs instanceof PDFArray && cs.get(0) === PDFName.of("ICCBased")) {
    const profile = resolve(cs.get(1));
    const n = profile instanceof PDFRawStream ? num(resolve(name(profile.dict, "N"))) : 0;
    return n === 1 || n === 3 ? n : 0;
  }
  return 0;
}

function filterNames(dict: PDFDict, resolve: Resolve): PDFObject[] | null {
  const filter = resolve(name(dict, "Filter"));
  if (filter === undefined) return [];
  if (filter instanceof PDFName) return [filter];
  if (filter instanceof PDFArray) return filter.asArray().map((f) => resolve(f)!);
  return null;
}

/**
 * Undoes a PNG predictor (DecodeParms /Predictor 10–15), which stores each row as differences from
 * its neighbours, prefixed by a filter-type byte. Only 8-bit samples, which is all this file decodes.
 */
export function unpredictPng(data: Uint8Array, colors: number, columns: number): Uint8Array {
  const rowLength = colors * columns;
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = new Uint8Array(rows * rowLength);
  const bpp = colors;
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLength + 1)];
    const src = r * (rowLength + 1) + 1;
    const row = r * rowLength;
    const prev = row - rowLength;
    for (let i = 0; i < rowLength; i++) {
      const x = data[src + i];
      const a = i >= bpp ? out[row + i - bpp] : 0;
      const b = r > 0 ? out[prev + i] : 0;
      const c = r > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let value = x;
      if (type === 1) value = x + a;
      else if (type === 2) value = x + b;
      else if (type === 3) value = x + ((a + b) >> 1);
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[row + i] = value & 255;
    }
  }
  return out;
}

/** The image as something the encoder takes, or null when it should be left alone. */
function imageSource(stream: PDFRawStream, resolve: Resolve, width: number, height: number): ImageSource | null {
  const d = stream.dict;
  if (num(resolve(name(d, "BitsPerComponent"))) !== 8) return null;
  // Decode arrays and colour-key masks depend on the exact sample values, which re-encoding changes.
  if (name(d, "Decode") || name(d, "Mask") || name(d, "ImageMask")) return null;
  const components = colourComponents(d, resolve);
  const filters = filterNames(d, resolve);
  if (!components || !filters) return null;

  if (filters.length === 1 && filters[0] === PDFName.of("DCTDecode")) return { kind: "jpeg", bytes: stream.contents };
  if (filters.length === 0 || !filters.every((f) => LOSSLESS_FILTERS.includes(f as PDFName))) return null;
  if (width * height > MAX_PIXELS) return null;

  // Only one filter's parameters matter here: Flate or LZW, the ones that take a predictor.
  const parmsObj = resolve(name(d, "DecodeParms"));
  const parms = parmsObj instanceof PDFArray ? parmsObj.asArray().map((p) => resolve(p)).find((p) => p instanceof PDFDict) : parmsObj;
  const predictor = parms instanceof PDFDict ? num(resolve(name(parms, "Predictor"))) : 0;
  // TIFF predictor 2 is rare in practice; leave those images alone.
  if (predictor > 1 && predictor < 10) return null;

  let samples: Uint8Array;
  try {
    samples = decodePDFRawStream(stream).decode();
  } catch {
    return null;
  }
  if (predictor >= 10) samples = unpredictPng(samples, components, width);
  if (samples.length < width * height * components) return null;

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, s = 0; p < rgba.length; p += 4, s += components) {
    const grey = components === 1;
    rgba[p] = samples[s];
    rgba[p + 1] = grey ? samples[s] : samples[s + 1];
    rgba[p + 2] = grey ? samples[s] : samples[s + 2];
    rgba[p + 3] = 255;
  }
  return { kind: "pixels", rgba, width, height };
}

/**
 * Shrinks a PDF by re-encoding its photos and PNG-style images as smaller JPEGs, and repacking objects
 * into compressed object streams. Text and vector graphics are untouched. Throws on encrypted or broken files.
 */
export async function compressPdf(
  input: Uint8Array,
  level: CompressLevel,
  encode: ImageEncoder,
  onProgress: (progress: CompressProgress) => void = () => {},
): Promise<CompressResult> {
  onProgress({ phase: "reading" });
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const { context } = doc;
  const resolve: Resolve = (o) => (o ? context.lookup(o) : undefined);
  const imageObjects = context
    .enumerateIndirectObjects()
    .filter((entry): entry is [PDFRef, PDFRawStream] => entry[1] instanceof PDFRawStream && name(entry[1].dict, "Subtype") === PDFName.of("Image"));
  const images = imageObjects.length;
  let recompressed = 0;

  for (const [i, [ref, obj]] of imageObjects.entries()) {
    onProgress({ phase: "images", done: i, total: images });

    const width = num(resolve(name(obj.dict, "Width")));
    const height = num(resolve(name(obj.dict, "Height")));
    if (!width || !height) continue;
    const source = imageSource(obj, resolve, width, height);
    if (!source) continue;

    const scale = Math.min(1, level.maxSide / Math.max(width, height));
    const target = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: level.quality };
    const jpeg = await encode(source, target);
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

  onProgress({ phase: "saving" });
  const saved = await doc.save({ useObjectStreams: true });
  // Repacking can occasionally grow a file that was already tightly packed; never hand back a bigger one.
  return { bytes: saved.length < input.length ? saved : input, images, recompressed };
}

/** Browser encoder: decodes with createImageBitmap and re-encodes on an OffscreenCanvas. */
export const browserImageEncoder: ImageEncoder = async (source, { width, height, quality }) => {
  try {
    const input =
      source.kind === "jpeg"
        ? new Blob([source.bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" })
        : new ImageData(source.rgba as Uint8ClampedArray<ArrayBuffer>, source.width, source.height);
    const bitmap = await createImageBitmap(input, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
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
