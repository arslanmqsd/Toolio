/**
 * Draws PDF pages and reads their text with pdf.js (Mozilla's renderer), which parses the PDF in its own worker.
 * Browser only, and loaded on first use so pages that never draw a PDF don't download it.
 */

import { exportScale, type ImageFormat } from "./pdf-to-image";
import { runsToText } from "./pdf-text";

/** A piece of a page's text, as a box on the page as seen: points from the top-left, rotation applied. */
export interface TextBox {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** What the PDF says about the piece's font, when pdf.js could tell. */
  font?: { family: "sans" | "serif" | "mono"; bold: boolean; italic: boolean };
}

export interface PdfRenderer {
  pageCount: number;
  /** A PNG of one page (zero-based), its longest side `maxSide` CSS pixels, with the page's own rotation applied. */
  thumbnail: (index: number, maxSide: number) => Promise<Blob>;
  /** One page (zero-based) at `dpi`, as PNG or JPEG, shrunk if needed to stay inside browser canvas limits. */
  image: (index: number, dpi: number, format: ImageFormat) => Promise<Blob>;
  /** One page's size (zero-based) in points as seen, rotation applied. */
  size: (index: number) => Promise<{ width: number; height: number }>;
  /**
   * One page's text pieces (zero-based) in the order the PDF stores them, usually reading order. Only text
   * running left to right as seen is included; sideways or upside-down text is left out.
   */
  textBoxes: (index: number) => Promise<TextBox[]>;
  /** One page's text (zero-based), with line and paragraph breaks rebuilt from where the text sits. */
  text: (index: number) => Promise<string>;
  destroy: () => void;
}

const MIME: Record<ImageFormat, string> = { png: "image/png", jpg: "image/jpeg" };

export async function openPdfRenderer(bytes: Uint8Array): Promise<PdfRenderer> {
  const pdfjs = await import("pdfjs-dist");
  // Started like the app's own workers so it gets bundled as a module. Pointing workerSrc at the file
  // instead makes Next 14 copy it as a plain asset and minify it as a script, which fails on import.meta.
  // One worker serves every file opened on the page.
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  // pdf.js takes ownership of the buffer it's given, so hand it a copy.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;

  /** Draws a page at a scale picked from its natural size (in points, rotation applied) and encodes it. */
  async function draw(index: number, pickScale: (width: number, height: number) => number, format: ImageFormat): Promise<Blob> {
    const page = await doc.getPage(index + 1);
    const canvas = document.createElement("canvas");
    try {
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pickScale(natural.width, natural.height) });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // pdf.js paints a white background first, so JPEGs don't come out black where the page is transparent.
      await page.render({ canvas, viewport }).promise;
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("render failed"))), MIME[format], format === "jpg" ? 0.92 : undefined),
      );
    } finally {
      page.cleanup();
      // Frees the bitmap now; big pages at print resolution are tens of megabytes each.
      canvas.width = canvas.height = 0;
    }
  }

  return {
    pageCount: doc.numPages,
    // Sharp on high-density screens without drawing huge canvases for big pages.
    thumbnail: (index, maxSide) => draw(index, (w, h) => (maxSide * Math.min(window.devicePixelRatio || 1, 2)) / Math.max(w, h), "png"),
    image: (index, dpi, format) => draw(index, (w, h) => exportScale(w, h, dpi), format),
    async size(index) {
      const { width, height } = (await doc.getPage(index + 1)).getViewport({ scale: 1 });
      return { width, height };
    },
    async textBoxes(index) {
      const page = await doc.getPage(index + 1);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const { items, styles } = await page.getTextContent();
        // Loading the page's drawing loads its fonts, which say whether they're bold or italic.
        await page.getOperatorList().catch(() => null);
        const fonts = new Map<string, TextBox["font"]>();
        const fontOf = (id: string): TextBox["font"] => {
          if (!fonts.has(id)) {
            const generic = styles[id]?.fontFamily ?? "";
            let loaded: { name?: string; bold?: boolean; italic?: boolean } | null = null;
            try {
              loaded = page.commonObjs.has(id) ? page.commonObjs.get(id) : null;
            } catch {
              loaded = null;
            }
            const name = loaded?.name ?? "";
            fonts.set(id, {
              family: /mono|courier/i.test(generic + name) ? "mono" : /(^|[^-])serif|times|georgia|garamond/i.test(generic + name) && !/sans/i.test(generic) ? "serif" : "sans",
              bold: !!loaded?.bold || /bold|black|heavy|semibold/i.test(name),
              italic: !!loaded?.italic || /italic|oblique/i.test(name),
            });
          }
          return fonts.get(id);
        };
        const boxes: TextBox[] = [];
        for (const item of items) {
          if (!("str" in item) || !item.str.trim() || !item.width) continue;
          const [a, b, c, d, e, f] = item.transform;
          const size = Math.hypot(c, d) || item.height;
          const len = Math.hypot(a, b) || 1;
          const [ux, uy] = [a / len, b / len];
          // The run's box in page space: along its baseline, from a little below it (descenders) to the ascent.
          const corner = (along: number, up: number) => viewport.convertToViewportPoint(e + ux * along - uy * up, f + uy * along + ux * up) as [number, number];
          const [start, end, top, bottom] = [corner(0, 0), corner(item.width, 0), corner(0, size * 0.85), corner(0, -size * 0.25)];
          if (end[0] - start[0] <= 0 || Math.abs(end[1] - start[1]) > (end[0] - start[0]) * 0.1) continue;
          boxes.push({ str: item.str, x: start[0], y: top[1], width: end[0] - start[0], height: bottom[1] - top[1], font: fontOf(item.fontName) });
        }
        return boxes;
      } finally {
        page.cleanup();
      }
    },
    async text(index) {
      const page = await doc.getPage(index + 1);
      try {
        const { items } = await page.getTextContent();
        return runsToText(
          items.flatMap((item) =>
            "str" in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, hasEOL: item.hasEOL }] : [],
          ),
        );
      } finally {
        page.cleanup();
      }
    },
    destroy: () => void doc.destroy(),
  };
}
