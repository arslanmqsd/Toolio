/**
 * Draws PDF pages with pdf.js (Mozilla's renderer), which parses the PDF in its own worker.
 * Browser only, and loaded on first use so pages that never draw a PDF don't download it.
 */

import { exportScale, type ImageFormat } from "./pdf-to-image";

export interface PdfRenderer {
  pageCount: number;
  /** A PNG of one page (zero-based), its longest side `maxSide` CSS pixels, with the page's own rotation applied. */
  thumbnail: (index: number, maxSide: number) => Promise<Blob>;
  /** One page (zero-based) at `dpi`, as PNG or JPEG, shrunk if needed to stay inside browser canvas limits. */
  image: (index: number, dpi: number, format: ImageFormat) => Promise<Blob>;
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
    destroy: () => void doc.destroy(),
  };
}
