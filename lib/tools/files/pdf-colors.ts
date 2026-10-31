/** Ink colours offered by the tools that draw on PDF pages, as "#rrggbb", in the rows the picker shows them. */
export const SWATCH_ROWS: { color: string; label: string }[][] = [
  [
    { color: "#ffffff", label: "White" },
    { color: "#000000", label: "Black" },
  ],
  [
    { color: "#e74c3c", label: "Red" },
    { color: "#d63864", label: "Pink" },
    { color: "#8e44ad", label: "Purple" },
    { color: "#4a90e2", label: "Blue" },
    { color: "#4ab8d0", label: "Cyan" },
    { color: "#5baa57", label: "Green" },
  ],
  [
    { color: "#ffeb5a", label: "Yellow" },
    { color: "#f06433", label: "Orange" },
    { color: "#7a5548", label: "Brown" },
    { color: "#e0e0e0", label: "Light gray" },
    { color: "#9e9e9e", label: "Gray" },
    { color: "#424242", label: "Dark gray" },
  ],
];

/** "#rrggbb" as 0–1 RGB. */
export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number];
}
