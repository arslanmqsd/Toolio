/** Browser side of Images to PDF: turns any image the browser can show into bytes a PDF can hold. */

import { jpegOrientation, sniffImage, type EmbeddableType } from "./images-to-pdf";

export interface PreparedImage {
  bytes: ArrayBuffer;
  type: EmbeddableType;
}

/** Pixel size as it displays, after any EXIF turn. Rejects when the browser can't decode the file. */
export async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * Upright JPEGs and all PNGs go in untouched, so nothing is lost. Sideways phone photos, WebP, GIF (first
 * frame), BMP and the rest are redrawn: photos stay JPEG, everything else becomes PNG to keep transparency.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bytes = await file.arrayBuffer();
  const type = sniffImage(new Uint8Array(bytes));
  if (type === "png" || (type === "jpg" && jpegOrientation(new Uint8Array(bytes)) === 1)) return { bytes, type };

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const out = type === "jpg" ? "jpg" : "png";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, out === "jpg" ? "image/jpeg" : "image/png", 0.92));
    if (!blob) throw new Error("This image couldn't be converted.");
    return { bytes: await blob.arrayBuffer(), type: out };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}

/**
 * A camera photo as an upright JPEG no longer than `maxSide` pixels. Phone cameras take 12–50 megapixels;
 * a page needs far less to print sharply, and the smaller file sends in seconds.
 */
export async function shrinkPhoto(file: Blob, maxSide = 2400): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("This photo couldn't be read.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
