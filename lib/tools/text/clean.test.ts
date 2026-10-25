import { describe, expect, it } from "vitest";
import { DEFAULT_CLEAN, cleanText, type CleanOptions } from "./clean";

const clean = (text: string, options: Partial<CleanOptions> = {}) => cleanText(text, { ...DEFAULT_CLEAN, ...options });

describe("cleanText", () => {
  it("strips invisible characters and turns odd spaces into plain ones", () => {
    expect(clean("﻿hel​lo wor­ld")).toBe("hello world");
    expect(clean("a b", { invisible: false })).toBe("a b");
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
});
