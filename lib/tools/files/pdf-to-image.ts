export type ImageFormat = "png" | "jpg";

/**
 * Pixel budget for one page. Safari refuses canvases over 16,777,216 pixels (4096²) and draws nothing;
 * other browsers allow more, but a bigger image wouldn't open everywhere anyway.
 */
export const MAX_PIXELS = 4096 * 4096;

/** PDF sizes are in points, 72 to the inch. */
const POINTS_PER_INCH = 72;

/** Scale for pdf.js that gives `dpi`, reduced if the page would go over `maxPixels`. */
export function exportScale(widthPt: number, heightPt: number, dpi: number, maxPixels = MAX_PIXELS): number {
  const scale = dpi / POINTS_PER_INCH;
  const pixels = widthPt * scale * (heightPt * scale);
  return pixels <= maxPixels ? scale : scale * Math.sqrt(maxPixels / pixels);
}

/**
 * Rough pixel count of a job, assuming letter-size pages. Past `HEAVY_PIXELS` (50 letter pages at 300 DPI,
 * about 420 million pixels) the finished images can reach hundreds of megabytes, so the tool warns first.
 */
export const jobPixels = (pages: number, dpi: number) => pages * 612 * 792 * (dpi / POINTS_PER_INCH) ** 2;
export const HEAVY_PIXELS = jobPixels(50, 300);

/** "report-page-07.jpg": numbers padded to the page count so files sort in page order. */
export function imageName(pdfName: string, page: number, pageCount: number, format: ImageFormat): string {
  const base = pdfName.replace(/\.pdf$/i, "") || "document";
  return `${base}-page-${String(page).padStart(String(pageCount).length, "0")}.${format}`;
}
