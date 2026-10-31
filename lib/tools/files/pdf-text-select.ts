/** Selecting a page's own text by dragging, for highlight, underline, strikethrough and squiggly marks. */

import type { Box } from "./pdf-editor";
import type { TextBox } from "./pdf-render";

/** One letter's slot on the page as seen, and which text piece it came from. */
export interface Char {
  x: number;
  y: number;
  width: number;
  height: number;
  piece: number;
}

/**
 * Splits each text piece into letters. `measure` gives a string's width in any unit; each letter's share of
 * its piece follows it, so wide and narrow letters get their own room. pdf.js only gives a whole piece's
 * width, so this is an estimate that's close for ordinary fonts.
 */
export function splitChars(boxes: TextBox[], measure: (text: string) => number = (text) => text.length): Char[] {
  return boxes.flatMap((box, piece) => {
    const letters = [...box.str];
    const total = measure(box.str) || letters.length;
    let before = "";
    return letters.map((letter) => {
      const x = box.x + (measure(before) / total) * box.width;
      before += letter;
      return { x, y: box.y, width: box.x + (measure(before) / total) * box.width - x, height: box.height, piece };
    });
  });
}

/** How far from text a press may land and still pick the nearest letter, in points. */
const REACH = 12;

/**
 * The letter at a point: the one under it, else the nearest on the same line, else the nearest within reach.
 * Null when no text is close.
 */
export function charAt(chars: Char[], x: number, y: number): number | null {
  let best: number | null = null;
  let bestDistance = REACH;
  for (const [i, c] of chars.entries()) {
    const dx = x < c.x ? c.x - x : x > c.x + c.width ? x - c.x - c.width : 0;
    const dy = y < c.y ? c.y - y : y > c.y + c.height ? y - c.y - c.height : 0;
    if (!dx && !dy) return i;
    // On the same line, sideways distance only, so a press past a line's end picks its last letter.
    const distance = dy ? Math.hypot(dx, dy) + REACH / 2 : dx;
    if (distance < bestDistance) [best, bestDistance] = [i, distance];
  }
  return best;
}

/**
 * Boxes over the letters from `from` to `to` (either order), one per line: letters next to each other on
 * the same line join up, even across text pieces.
 */
export function selectionRects(chars: Char[], from: number, to: number): Box[] {
  const rects: Box[] = [];
  for (const c of chars.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    const last = rects[rects.length - 1];
    const sameLine = last && Math.abs(last.y - c.y) < c.height * 0.5 && Math.abs(last.height - c.height) < c.height * 0.5;
    const near = last && c.x >= last.x - 1 && c.x - (last.x + last.width) < c.height;
    if (sameLine && near) {
      const right = Math.max(last.x + last.width, c.x + c.width);
      const top = Math.min(last.y, c.y);
      last.height = Math.max(last.y + last.height, c.y + c.height) - top;
      last.y = top;
      last.width = right - last.x;
    } else rects.push({ x: c.x, y: c.y, width: c.width, height: c.height });
  }
  return rects;
}
