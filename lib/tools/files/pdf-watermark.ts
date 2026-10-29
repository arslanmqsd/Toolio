import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import { PDF_COLORS, type PdfColor } from "./pdf-colors";

export type WatermarkLayout = "center" | "tiled";
export type WatermarkSize = "small" | "medium" | "large";

export interface WatermarkOptions {
  text: string;
  layout: WatermarkLayout;
  size: WatermarkSize;
  /** 0–1. */
  opacity: number;
  /** Degrees anticlockwise as the page is seen, so 45 runs bottom-left to top-right. */
  angle: number;
  color: PdfColor;
}

export type WatermarkProgress = { phase: "reading" } | { phase: "stamping"; done: number; total: number } | { phase: "saving" };

/** How wide the text runs: centred, as a share of the page's diagonal; tiled, of its shorter side. */
const SPAN: Record<WatermarkLayout, Record<WatermarkSize, number>> = {
  center: { small: 0.35, medium: 0.55, large: 0.8 },
  tiled: { small: 0.2, medium: 0.3, large: 0.45 },
};

/** The extra characters Windows-1252 has over Latin-1, which the built-in PDF fonts can draw. */
const CP1252_EXTRAS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/**
 * Characters the built-in PDF fonts can't draw, each listed once. They cover Western European text only;
 * other scripts and emoji need an embedded font.
 */
export function unsupportedCharacters(text: string): string[] {
  const bad = [...text].filter((ch) => {
    const code = ch.codePointAt(0)!;
    return !((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRAS.includes(ch));
  });
  return [...new Set(bad)];
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Centre points for each copy of the watermark on a page `box` (as seen). One in the middle, or a grid
 * that reaches past the corners so rotated rows still cover the whole page.
 */
export function stampCentres(box: Box, layout: WatermarkLayout, textWidth: number, textHeight: number): [number, number][] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (layout === "center") return [[cx, cy]];
  const stepX = textWidth * 1.5;
  const stepY = textHeight * 4;
  const reach = Math.hypot(box.width, box.height) / 2;
  const centres: [number, number][] = [];
  for (let row = -Math.ceil(reach / stepY); row <= Math.ceil(reach / stepY); row++) {
    // Every other row shifts half a step, like bricks, so copies don't line up in columns.
    const shift = row % 2 ? stepX / 2 : 0;
    for (let col = -Math.ceil(reach / stepX) - 1; col <= Math.ceil(reach / stepX); col++) centres.push([cx + col * stepX + shift, cy + row * stepY]);
  }
  return centres;
}

/** Font size so the text spans its share of the page, but never taller than 40% of the shorter side. */
export function fontSizeFor(box: Box, options: Pick<WatermarkOptions, "layout" | "size">, widthAtOne: number, heightAtOne: number): number {
  const short = Math.min(box.width, box.height);
  const span = SPAN[options.layout][options.size] * (options.layout === "center" ? Math.hypot(box.width, box.height) : short);
  return Math.min(span / widthAtOne, (short * 0.4) / heightAtOne);
}

function stampPage(page: ReturnType<PDFDocument["getPage"]>, font: PDFFont, options: WatermarkOptions) {
  const box = page.getCropBox();
  const pageTurn = page.getRotation().angle;
  // A page shown turned (its /Rotate) has its sides swapped on screen; size the text for what's seen.
  const seen = pageTurn % 180 ? { ...box, width: box.height, height: box.width } : box;
  const size = fontSizeFor(seen, options, font.widthOfTextAtSize(options.text, 1), font.heightAtSize(1, { descender: false }));
  const width = font.widthOfTextAtSize(options.text, size);
  const height = font.heightAtSize(size, { descender: false });
  // Drawing coordinates turn with the page, so add its turn to keep the angle as the reader sees it.
  const angle = options.angle + pageTurn;
  const rad = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  // The text is drawn from its bottom-left corner; step back half its width and height along the rotated axes.
  const dx = (width / 2) * cos - (height / 2) * sin;
  const dy = (width / 2) * sin + (height / 2) * cos;
  const [r, g, b] = PDF_COLORS[options.color];
  // The grid is laid out in drawing coordinates, which cover the same area whichever way the page turns.
  for (const [cx, cy] of stampCentres(box, options.layout, width, height)) {
    page.drawText(options.text, { x: cx - dx, y: cy - dy, size, font, color: rgb(r, g, b), opacity: options.opacity, rotate: degrees(angle) });
  }
}

/**
 * Stamps `options.text` on the zero-based `pages` (all when omitted). Throws on encrypted or broken files,
 * and on text the built-in fonts can't draw.
 */
export async function watermarkPdf(input: Uint8Array, options: WatermarkOptions, pages?: number[], onProgress: (progress: WatermarkProgress) => void = () => {}): Promise<Uint8Array> {
  const text = options.text.trim();
  if (!text) throw new Error("Enter the watermark text.");
  const bad = unsupportedCharacters(text);
  if (bad.length) throw new Error(`The built-in PDF fonts can't draw ${bad.join(" ")}.`);
  onProgress({ phase: "reading" });
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const targets = pages ?? doc.getPageIndices();
  for (const [i, index] of targets.entries()) {
    onProgress({ phase: "stamping", done: i, total: targets.length });
    stampPage(doc.getPage(index), font, { ...options, text });
  }
  onProgress({ phase: "saving" });
  return doc.save({ useObjectStreams: true });
}
