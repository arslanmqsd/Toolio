/**
 * Editing a PDF's own text by covering it and writing over it: the page's text pieces grouped into lines and
 * blocks (paragraphs, table cells, headings), and the colours to cover and rewrite them with.
 */

import type { Box } from "./pdf-editor";
import type { PdfFont } from "./pdf-fonts";
import type { TextBox } from "./pdf-render";

export interface TextLine {
  text: string;
  box: Box;
}

export interface TextBlock {
  lines: TextLine[];
  /** Covers every line. */
  box: Box;
  /** Font size in points. */
  size: number;
  font: PdfFont;
  bold: boolean;
  italic: boolean;
  /** Distance between baselines, in points; null for a single line. */
  leading: number | null;
}

/** A text piece's box is 0.85 of the font size above the baseline and 0.25 below (see pdf-render). */
const BOX_PER_SIZE = 1.1;
const ASCENT_IN_BOX = 0.85;

/** Where a line's baseline sits, in points from the page's top. */
export const baselineOf = (box: Box) => box.y + (box.height / BOX_PER_SIZE) * ASCENT_IN_BOX;

const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

const styleOf = (piece: TextBox) => `${piece.font?.family ?? "sans"} ${piece.font?.bold ?? false} ${piece.font?.italic ?? false}`;

/**
 * Groups text pieces into lines (pieces side by side on one baseline) and lines into blocks (lines stacked
 * close together with the same left edge, size and style). Pieces far apart on one baseline, like table
 * columns, stay in separate blocks.
 */
export function textBlocks(pieces: TextBox[]): TextBlock[] {
  const lines: (TextLine & { first: TextBox; last: TextBox })[] = [];
  for (const piece of pieces) {
    const line = lines[lines.length - 1];
    const h = piece.height;
    const gap = line ? piece.x - (line.last.x + line.last.width) : 0;
    const sameLine =
      line && Math.abs(line.last.y - piece.y) < h * 0.3 && Math.abs(line.last.height - h) < h * 0.3 && gap > -h * 0.5 && gap < h * 1.2 && styleOf(line.last) === styleOf(piece);
    if (sameLine) {
      // pdf.js leaves out most spaces between pieces; a visible gap means there was one.
      const space = gap > h * 0.12 && !line.text.endsWith(" ") && !piece.str.startsWith(" ") ? " " : "";
      line.text += space + piece.str;
      line.box = union(line.box, piece);
      line.last = piece;
    } else lines.push({ text: piece.str, box: { x: piece.x, y: piece.y, width: piece.width, height: piece.height }, first: piece, last: piece });
  }

  const blocks: (TextBlock & { style: string })[] = [];
  for (const { text, box, first } of lines) {
    const block = blocks[blocks.length - 1];
    const above = block?.lines[block.lines.length - 1].box;
    const h = box.height;
    const joins =
      block &&
      block.style === styleOf(first) &&
      Math.abs(above.height - h) < h * 0.2 &&
      box.y - (above.y + above.height) > -h * 0.3 &&
      box.y - (above.y + above.height) < h * 0.6 &&
      Math.abs(box.x - block.box.x) < h * 1.5;
    const line = { text: text.trim(), box };
    if (joins) {
      block.lines.push(line);
      block.box = union(block.box, box);
    } else {
      blocks.push({
        lines: [line],
        box: { ...box },
        size: 0,
        font: first.font?.family ?? "sans",
        bold: first.font?.bold ?? false,
        italic: first.font?.italic ?? false,
        leading: null,
        style: styleOf(first),
      });
    }
  }

  return blocks.map(({ lines: blockLines, box, font, bold, italic }) => {
    const heights = blockLines.map((l) => l.box.height).sort((a, b) => a - b);
    const size = Math.round((heights[Math.floor(heights.length / 2)] / BOX_PER_SIZE) * 10) / 10;
    const n = blockLines.length;
    const leading = n > 1 ? Math.round(((baselineOf(blockLines[n - 1].box) - baselineOf(blockLines[0].box)) / (n - 1)) * 100) / 100 : null;
    return { lines: blockLines, box, size, font, bold, italic, leading };
  });
}

/** The block under a point on the page, if any. */
export function blockAt(blocks: TextBlock[], x: number, y: number): TextBlock | null {
  return blocks.find(({ box: b }) => x >= b.x - 2 && x <= b.x + b.width + 2 && y >= b.y - 2 && y <= b.y + b.height + 2) ?? null;
}

const hex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/**
 * The colours to cover a block with and to rewrite it in, read from the drawn page (RGBA pixels, `width`
 * wide). `box` is in those pixels. The background is the usual colour just outside the box; the text is the
 * pixel inside that differs from it most.
 */
export function blockColors(pixels: Uint8ClampedArray, width: number, height: number, box: Box): { background: string; text: string } {
  const at = (x: number, y: number) => {
    const i = (Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  const [left, top, right, bottom] = [box.x - 2, box.y - 2, box.x + box.width + 2, box.y + box.height + 2];
  const ring: number[][] = [];
  for (let x = left; x <= right; x += 1) ring.push(at(x, top), at(x, bottom));
  for (let y = top; y <= bottom; y += 1) ring.push(at(left, y), at(right, y));
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const background = [0, 1, 2].map((c) => median(ring.map((p) => p[c])));

  let text = [0, 0, 0];
  let most = -1;
  for (let y = box.y; y < box.y + box.height; y += 1)
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const p = at(x, y);
      const diff = Math.abs(p[0] - background[0]) + Math.abs(p[1] - background[1]) + Math.abs(p[2] - background[2]);
      if (diff > most) [text, most] = [p, diff];
    }
  return { background: hex(background), text: hex(text) };
}
