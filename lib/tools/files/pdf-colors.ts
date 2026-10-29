/** Ink colours offered by the tools that draw on PDF pages, as 0–1 RGB. */
export const PDF_COLORS = {
  black: [0, 0, 0],
  gray: [0.5, 0.5, 0.5],
  red: [0.8, 0.1, 0.1],
  blue: [0.1, 0.3, 0.8],
} as const satisfies Record<string, readonly [number, number, number]>;

export type PdfColor = keyof typeof PDF_COLORS;

export const PDF_COLOR_OPTIONS: { id: PdfColor; label: string }[] = [
  { id: "black", label: "Black" },
  { id: "gray", label: "Gray" },
  { id: "red", label: "Red" },
  { id: "blue", label: "Blue" },
];
