import { describe, expect, it } from "vitest";
import { charAt, selectionRects, splitChars } from "./pdf-text-select";

// Two lines of text: "Hello world" split in two pieces, then "Next line" below.
const BOXES = [
  { str: "Hello ", x: 10, y: 100, width: 60, height: 12 },
  { str: "world", x: 70, y: 100, width: 50, height: 12 },
  { str: "Next line", x: 10, y: 120, width: 90, height: 12 },
];
const chars = splitChars(BOXES);

describe("splitChars", () => {
  it("gives each letter an equal share of its piece by default", () => {
    expect(chars).toHaveLength(20);
    expect(chars[0]).toEqual({ x: 10, y: 100, width: 10, height: 12, piece: 0 });
    expect(chars[6]).toEqual({ x: 70, y: 100, width: 10, height: 12, piece: 1 });
    expect(chars[11].piece).toBe(2);
  });

  it("follows the measured widths, so wide letters get more room", () => {
    const [m, i] = splitChars([{ str: "mi", x: 0, y: 0, width: 40, height: 10 }], (t) => [...t].reduce((n, ch) => n + (ch === "m" ? 3 : 1), 0));
    expect(m.width).toBe(30);
    expect(i).toMatchObject({ x: 30, width: 10 });
  });

  it("keeps letters that need two UTF-16 units together", () => {
    expect(splitChars([{ str: "a😀", x: 0, y: 0, width: 20, height: 10 }])).toHaveLength(2);
  });
});

describe("charAt", () => {
  it("finds the letter under the point", () => {
    expect(charAt(chars, 15, 105)).toBe(0);
    expect(charAt(chars, 75, 105)).toBe(6);
    expect(charAt(chars, 15, 125)).toBe(11);
  });

  it("picks the nearest letter on the line when the point is just past its end", () => {
    expect(charAt(chars, 125, 105)).toBe(10);
    expect(charAt(chars, 5, 125)).toBe(11);
  });

  it("returns null far from any text", () => {
    expect(charAt(chars, 300, 300)).toBeNull();
    expect(charAt([], 0, 0)).toBeNull();
  });
});

describe("selectionRects", () => {
  it("joins letters on one line into one box, across pieces", () => {
    expect(selectionRects(chars, 0, 10)).toEqual([{ x: 10, y: 100, width: 110, height: 12 }]);
  });

  it("gives each line its own box", () => {
    expect(selectionRects(chars, 8, 14)).toEqual([
      { x: 90, y: 100, width: 30, height: 12 },
      { x: 10, y: 120, width: 40, height: 12 },
    ]);
  });

  it("works whichever way the drag went", () => {
    expect(selectionRects(chars, 14, 8)).toEqual(selectionRects(chars, 8, 14));
  });

  it("covers a single letter", () => {
    expect(selectionRects(chars, 3, 3)).toEqual([{ x: 40, y: 100, width: 10, height: 12 }]);
  });

  it("starts a new box when the next piece is far along the same line, like another column", () => {
    const columns = splitChars([
      { str: "ab", x: 0, y: 0, width: 20, height: 10 },
      { str: "cd", x: 300, y: 0, width: 20, height: 10 },
    ]);
    expect(selectionRects(columns, 0, 3)).toHaveLength(2);
  });
});
