/**
 * HTML to PDF through the browser's own print engine: the page set up with CSS @page rules, then printed
 * to "Save as PDF". Text stays text and CSS renders exactly as the browser draws it.
 */
import { PREVIEW_CSP } from "@/lib/html-preview";

export const PAGE_SIZES = [
  { id: "a4", label: "A4", css: "A4", mm: [210, 297] },
  { id: "letter", label: "Letter", css: "letter", mm: [215.9, 279.4] },
  { id: "legal", label: "Legal", css: "legal", mm: [215.9, 355.6] },
] as const;

export const MARGINS = [
  { id: "none", label: "None", mm: 0 },
  { id: "small", label: "Small", mm: 10 },
  { id: "normal", label: "Normal", mm: 20 },
] as const;

export interface PageSetup {
  size: (typeof PAGE_SIZES)[number]["id"];
  orientation: "portrait" | "landscape";
  margin: (typeof MARGINS)[number]["id"];
  /** Print background colours and images, as on screen. Browsers drop them by default to save ink. */
  backgrounds: boolean;
}

export const DEFAULT_SETUP: PageSetup = { size: "a4", orientation: "portrait", margin: "small", backgrounds: true };

const PX_PER_MM = 96 / 25.4;

/** The page's width and height in millimetres, turned for landscape. */
export function pageMm({ size, orientation }: PageSetup): [number, number] {
  const [w, h] = PAGE_SIZES.find((s) => s.id === size)!.mm;
  return orientation === "landscape" ? [h, w] : [w, h];
}

/** How wide the content is inside the margins, in CSS pixels: the width the page's text wraps at. */
export function printableWidthPx(setup: PageSetup): number {
  const margin = MARGINS.find((m) => m.id === setup.margin)!.mm;
  return Math.round((pageMm(setup)[0] - 2 * margin) * PX_PER_MM);
}

/** The @page and colour rules for a setup. They come after the page's own styles, so the setup wins. */
export function printCss(setup: PageSetup): string {
  const { css } = PAGE_SIZES.find((s) => s.id === setup.size)!;
  const margin = MARGINS.find((m) => m.id === setup.margin)!.mm;
  const colors = setup.backgrounds ? "html, body, * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" : "";
  return `@page { size: ${css} ${setup.orientation}; margin: ${margin}mm; }\n${colors}`;
}

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A complete document to print, from a sanitized page body (see sanitizePage). The title becomes the
 * PDF's suggested file name. The same CSP as the preview: no scripts, nothing fetched but images.
 */
export function printDocument(sanitizedBody: string, bodyAttributes: string, setup: PageSetup, title: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<meta name="referrer" content="no-referrer">
<title>${escapeText(title)}</title>
<style>:root { color-scheme: light; } body { background: #fff; color: #000; }</style>
</head>
<body${bodyAttributes}>${sanitizedBody}<style>${printCss(setup)}</style></body>
</html>`;
}
