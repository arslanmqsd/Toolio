import { describe, expect, it } from "vitest";
import { baselineOf, blockAt, blockColors, textBlocks } from "./pdf-edit-text";
import type { TextBox } from "./pdf-render";

const sans = { family: "sans", bold: false, italic: false } as const;
/** A piece of 11pt text (box 12.1pt tall) at (x, y), 6pt per letter. */
const piece = (str: string, x: number, y: number, extra: Partial<TextBox> = {}): TextBox => ({ str, x, y, width: str.length * 6, height: 12.1, font: sans, ...extra });

describe("textBlocks", () => {
  it("joins pieces on one baseline into a line, putting back the spaces pdf.js drops", () => {
    const [block] = textBlocks([piece("Hello", 10, 100), piece("world", 10 + 30 + 3, 100)]);
    expect(block.lines).toHaveLength(1);
    expect(block.lines[0].text).toBe("Hello world");
    expect(block.box).toEqual({ x: 10, y: 100, width: 63, height: expect.closeTo(12.1) });
  });

  it("doesn't add a space between pieces that touch", () => {
    const [block] = textBlocks([piece("Hel", 10, 100), piece("lo", 28, 100)]);
    expect(block.lines[0].text).toBe("Hello");
  });

  it("stacks close lines with the same left edge into one block", () => {
    const blocks = textBlocks([piece("First line", 10, 100), piece("Second line", 10, 114), piece("Third", 10, 128)]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines.map((l) => l.text)).toEqual(["First line", "Second line", "Third"]);
    expect(blocks[0].leading).toBe(14);
    expect(blocks[0].size).toBe(11);
  });

  it("starts a new block after a paragraph gap", () => {
    expect(textBlocks([piece("One", 10, 100), piece("Two", 10, 140)])).toHaveLength(2);
  });

  it("keeps table columns on one baseline apart", () => {
    const blocks = textBlocks([piece("Challenge", 10, 100), piece("Adding a constraint", 120, 100)]);
    expect(blocks.map((b) => b.lines[0].text)).toEqual(["Challenge", "Adding a constraint"]);
  });

  it("keeps a heading apart from the body under it when the size or weight differs", () => {
    const heading = piece("Title", 10, 80, { height: 20, font: { ...sans, bold: true } });
    const blocks = textBlocks([heading, piece("Body", 10, 102)]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ bold: true, size: 18.2, leading: null });
  });

  it("carries the font family and style", () => {
    const [block] = textBlocks([piece("Serif", 10, 100, { font: { family: "serif", bold: false, italic: true } })]);
    expect(block).toMatchObject({ font: "serif", italic: true, bold: false });
  });

  it("treats pieces without font details as plain sans", () => {
    const [block] = textBlocks([{ str: "Plain", x: 0, y: 0, width: 30, height: 11 }]);
    expect(block).toMatchObject({ font: "sans", bold: false, italic: false });
  });

  it("returns nothing for a page without text", () => {
    expect(textBlocks([])).toEqual([]);
  });
});

describe("baselineOf", () => {
  it("sits 0.85 of the font size below the box top", () => {
    expect(baselineOf({ x: 0, y: 100, width: 10, height: 11 })).toBeCloseTo(108.5);
  });
});

describe("blockAt", () => {
  const blocks = textBlocks([piece("Here", 10, 100), piece("There", 200, 300)]);
  it("finds the block under a point, with a little room around it", () => {
    expect(blockAt(blocks, 15, 105)?.lines[0].text).toBe("Here");
    expect(blockAt(blocks, 9, 99)?.lines[0].text).toBe("Here");
    expect(blockAt(blocks, 210, 305)?.lines[0].text).toBe("There");
  });
  it("returns null away from text", () => {
    expect(blockAt(blocks, 400, 400)).toBeNull();
  });
});

describe("blockColors", () => {
  /** A 20 × 10 picture filled with `bg`, with one `ink` pixel at (8, 5). */
  function picture(bg: number[], ink: number[]) {
    const pixels = new Uint8ClampedArray(20 * 10 * 4);
    for (let i = 0; i < 200; i++) pixels.set([...bg, 255], i * 4);
    pixels.set([...ink, 255], (5 * 20 + 8) * 4);
    return pixels;
  }

  it("reads the background around the box and the ink inside it", () => {
    expect(blockColors(picture([255, 255, 255], [0, 0, 0]), 20, 10, { x: 5, y: 3, width: 8, height: 4 })).toEqual({ background: "#ffffff", text: "#000000" });
  });

  it("works on coloured backgrounds", () => {
    expect(blockColors(picture([240, 230, 200], [200, 20, 20]), 20, 10, { x: 5, y: 3, width: 8, height: 4 })).toEqual({ background: "#f0e6c8", text: "#c81414" });
  });

  it("stays inside the picture for boxes at its edge", () => {
    expect(blockColors(picture([255, 255, 255], [0, 0, 0]), 20, 10, { x: 0, y: 0, width: 20, height: 10 }).text).toBe("#000000");
  });
});
