import { StandardFonts } from "pdf-lib";

/** The font families built into every PDF reader, so nothing needs embedding. */
export type PdfFont = "sans" | "serif" | "mono";

/** Each family's faces: regular, bold, italic, bold italic. Index with (bold ? 1 : 0) + (italic ? 2 : 0). */
export const PDF_FONTS: Record<PdfFont, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

export const PDF_FONT_OPTIONS: { id: PdfFont; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

/** Close on-screen matches, for previews drawn in the browser. */
export const PDF_FONT_CSS: Record<PdfFont, string> = {
  sans: "Helvetica, Arial, sans-serif",
  serif: "'Times New Roman', Times, serif",
  mono: "'Courier New', Courier, monospace",
};
