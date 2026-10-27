import { describe, expect, it } from "vitest";
import { joinPages, runsToText, type TextRun } from "./pdf-text";

/** A run at (x, y), 12 points tall, about 6 points per character. */
const run = (str: string, x: number, y: number, extra: Partial<TextRun> = {}): TextRun => ({ str, x, y, width: str.length * 6, height: 12, hasEOL: false, ...extra });

describe("runsToText", () => {
  it("joins runs on one line, adding a space only where there's a gap", () => {
    expect(runsToText([run("Hello", 0, 700), run("world", 40, 700)])).toBe("Hello world");
    expect(runsToText([run("Hel", 0, 700), run("lo", 18, 700)])).toBe("Hello");
  });

  it("doesn't double a space the PDF already has", () => {
    expect(runsToText([run("Hello ", 0, 700), run("world", 40, 700)])).toBe("Hello world");
    expect(runsToText([run("Hello", 0, 700), run(" world", 40, 700)])).toBe("Hello world");
  });

  it("starts a new line when the text drops a line", () => {
    expect(runsToText([run("First line", 0, 700), run("Second line", 0, 686)])).toBe("First line\nSecond line");
  });

  it("leaves a blank line for a paragraph gap", () => {
    expect(runsToText([run("End of one.", 0, 700), run("Start of next.", 0, 660)])).toBe("End of one.\n\nStart of next.");
  });

  it("follows pdf.js's end-of-line marks, including empty marker runs", () => {
    expect(runsToText([run("One", 0, 700, { hasEOL: true }), run("Two", 30, 700)])).toBe("One\nTwo");
    expect(runsToText([run("One", 0, 700), { str: "", x: 0, y: 0, width: 0, height: 0, hasEOL: true }, run("Two", 30, 700)])).toBe("One\nTwo");
  });

  it("keeps superscripts and small shifts on the same line", () => {
    expect(runsToText([run("E = mc", 0, 700), run("2", 37, 704, { height: 8 })])).toBe("E = mc2");
  });

  it("moves to a new line when text jumps up, like the next column", () => {
    expect(runsToText([run("Left column end", 0, 100), run("Right column top", 300, 700)])).toBe("Left column end\nRight column top");
  });

  it("trims trailing spaces and blank edges", () => {
    expect(runsToText([run("  Title   ", 0, 700), run("Body  ", 0, 686)])).toBe("Title\nBody");
  });

  it("returns empty text for a page with none", () => {
    expect(runsToText([])).toBe("");
    expect(runsToText([{ str: "", x: 0, y: 0, width: 0, height: 0, hasEOL: true }])).toBe("");
  });

  it("copes with runs that report no height", () => {
    expect(runsToText([run("a", 0, 700, { height: 0 }), run("b", 0, 686, { height: 0 })])).toBe("a\nb");
  });
});

describe("joinPages", () => {
  const pages = [
    { page: 1, text: "Intro" },
    { page: 2, text: "" },
    { page: 3, text: "Body\ntext" },
  ];

  it("separates pages with a blank line and skips empty ones", () => {
    expect(joinPages(pages, false)).toBe("Intro\n\nBody\ntext");
  });

  it("marks every page, empty ones included, when asked", () => {
    expect(joinPages(pages, true)).toBe("--- Page 1 ---\nIntro\n\n--- Page 2 ---\n\n--- Page 3 ---\nBody\ntext");
  });

  it("gives empty text for no pages", () => {
    expect(joinPages([], false)).toBe("");
    expect(joinPages([], true)).toBe("");
  });
});
