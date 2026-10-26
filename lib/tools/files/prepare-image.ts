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
