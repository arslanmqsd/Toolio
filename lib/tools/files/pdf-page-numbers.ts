import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { PDF_COLORS, type PdfColor } from "./pdf-colors";

export type VerticalPosition = "top" | "bottom";
export type HorizontalPosition = "left" | "center" | "right";
export type NumberFont = "sans" | "serif" | "mono";
export type NumberFormat = "n" | "page-n" | "n-of-total" | "page-n-of-total";

export interface PageNumberOptions {
  vertical: VerticalPosition;
  horizontal: HorizontalPosition;
  /** Swap left and right on even pages, so numbers sit on the outer edge of a printed booklet. */
  mirror: boolean;
  /** Distance from the page edges, in points. */
  margin: number;
  format: NumberFormat;
  font: NumberFont;
  /** In points. */
  size: number;
  bold: boolean;
  color: PdfColor;
  /** The number the first numbered page gets. */
  start: number;
}

export type PageNumbersProgress = { phase: "reading" } | { phase: "numbering"; done: number; total: number } | { phase: "saving" };

const FONTS: Record<NumberFont, [StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold],
};

/** "7", "Page 7", "7 / 12", "Page 7 of 12". */
export function formatPageNumber(format: NumberFormat, n: number, total: number): string {
  switch (format) {
    case "n":
      return String(n);
    case "page-n":
      return `Page ${n}`;
    case "n-of-total":
      return `${n} / ${total}`;
    case "page-n-of-total":
      return `Page ${n} of ${total}`;
  }
}

/**
 * Where the number's baseline starts, on the page as seen (origin bottom-left). `capHeight` keeps a
 * top number's letters inside the margin rather than its baseline.
 */
export function seenOrigin(
  page: { width: number; height: number },
  text: { width: number; capHeight: number },
  { vertical, horizontal, margin }: Pick<PageNumberOptions, "vertical" | "horizontal" | "margin">,
): [number, number] {
  const x = horizontal === "left" ? margin : horizontal === "right" ? page.width - margin - text.width : (page.width - text.width) / 2;
  const y = vertical === "bottom" ? margin : page.height - margin - text.capHeight;
  return [x, y];
}

/**
 * Maps a point on the page as seen to the page's own drawing coordinates. A page with /Rotate is drawn
 * upright and turned clockwise for display, so seen and drawing axes differ by that turn.
 */
export function seenToUser(box: { x: number; y: number; width: number; height: number }, rotation: number, [sx, sy]: [number, number]): [number, number] {
  const { x, y, width: w, height: h } = box;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [x + w - sy, y + sx];
    case 180:
      return [x + w - sx, y + h - sy];
    case 270:
      return [x + sy, y + h - sx];
    default:
      return [x + sx, y + sy];
  }
}

/**
 * Numbers the zero-based `pages` (all when omitted) in order, from `options.start`. The total in
 * "of N" formats is the last number used. Throws on encrypted or broken files.
 */
export async function addPageNumbers(
  input: Uint8Array,
  options: PageNumberOptions,
  pages?: number[],
  onProgress: (progress: PageNumbersProgress) => void = () => {},
): Promise<Uint8Array> {
  onProgress({ phase: "reading" });
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const font = await doc.embedFont(FONTS[options.font][options.bold ? 1 : 0]);
  const targets = pages ?? doc.getPageIndices();
  const total = options.start + targets.length - 1;
  const capHeight = font.heightAtSize(options.size, { descender: false });
  const [r, g, b] = PDF_COLORS[options.color];

  for (const [i, index] of targets.entries()) {
    onProgress({ phase: "numbering", done: i, total: targets.length });
    const page = doc.getPage(index);
    const text = formatPageNumber(options.format, options.start + i, total);
    const box = page.getCropBox();
    const rotation = page.getRotation().angle;
    const seen = rotation % 180 ? { width: box.height, height: box.width } : box;
    // Booklets: odd pages are right-hand pages, so even ones get the mirror position.
    const flip = options.mirror && (index + 1) % 2 === 0 && options.horizontal !== "center";
    const horizontal = flip ? (options.horizontal === "left" ? "right" : "left") : options.horizontal;
    const origin = seenOrigin(seen, { width: font.widthOfTextAtSize(text, options.size), capHeight }, { ...options, horizontal });
    const [x, y] = seenToUser(box, rotation, origin);
    page.drawText(text, { x, y, size: options.size, font, color: rgb(r, g, b), rotate: degrees(rotation) });
  }
  onProgress({ phase: "saving" });
  return doc.save({ useObjectStreams: true });
}
