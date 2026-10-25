import { describe, expect, it } from "vitest";
import { DEFAULT_CLEAN, cleanText, type CleanOptions } from "./clean";

const clean = (text: string, options: Partial<CleanOptions> = {}) => cleanText(text, { ...DEFAULT_CLEAN, ...options });

describe("cleanText", () => {
  it("strips invisible characters and turns odd spaces into plain ones", () => {
    expect(clean("\uFEFFhel\u200Blo\u00A0wor\u00ADld")).toBe("hello world");
    expect(clean("a\u00A0b", { invisible: false })).toBe("a\u00A0b");
  });

  it("trims lines, collapses spaces and normalises line endings", () => {
    expect(clean("  a   b\t\tc  \r\n d \r e")).toBe("a b c\nd\ne");
  });

  it("squeezes, removes or keeps blank lines", () => {
    const text = "\n\na\n\n\n\nb\n\n";
    expect(clean(text)).toBe("a\n\nb");
    expect(clean(text, { blankLines: "remove" })).toBe("a\nb");
    expect(clean(text, { blankLines: "keep" })).toBe(text);
  });

  it("removes repeated lines but keeps the first of each", () => {
    expect(clean("b\na\nb\n\nc\na", { dedupeLines: true })).toBe("b\na\n\nc");
  });

  it("swaps smart punctuation for plain", () => {
    expect(clean("“Don’t” – wait…", { plainPunctuation: true })).toBe(`"Don't" - wait...`);
  });

  it("joins hard-wrapped lines, keeping paragraphs", () => {
    expect(clean("one\ntwo\n\n\nthree\nfour", { joinLines: true })).toBe("one two\n\nthree four");
    expect(clean("one\ntwo\n\nthree", { joinLines: true, blankLines: "remove" })).toBe("one two\nthree");
  });

  it("returns nothing for empty or whitespace-only text", () => {
    expect(clean("")).toBe("");
    expect(clean(" \t\n \n\u00A0")).toBe("");
  });

  it("keeps joiners that hold emoji and words together", () => {
    expect(clean("👨\u200D👩\u200D👧 family")).toBe("👨\u200D👩\u200D👧 family");
    expect(clean("می\u200Cخواهم")).toBe("می\u200Cخواهم");
  });

  it("leaves single tabs and, with the options off, spacing alone", () => {
    expect(clean("a\tb")).toBe("a\tb");
    expect(clean("  a   b  ", { trimLines: false, collapseSpaces: false })).toBe("  a   b  ");
    expect(clean("    a    b", { trimLines: false })).toBe(" a b");
  });

  it("keeps a single blank line between paragraphs and doesn't treat blank lines as duplicates", () => {
    expect(clean("a\n\nb\n\nc", { dedupeLines: true })).toBe("a\n\nb\n\nc");
  });

  it("compares lines after trimming when removing duplicates", () => {
    expect(clean("a\n  a  \nA", { dedupeLines: true })).toBe("a\nA");
  });

  it("joins lines and removes duplicates together", () => {
    expect(clean("one\none\ntwo\n\nthree", { joinLines: true, dedupeLines: true })).toBe("one two\n\nthree");
  });
});
