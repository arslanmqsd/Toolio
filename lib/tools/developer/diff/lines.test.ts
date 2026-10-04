import { describe, expect, it } from "vitest";
import { splitLines } from "./lines";

describe("splitLines", () => {
  it("splits on LF and CRLF", () => {
    expect(splitLines("a\r\nb\nc")).toEqual({ lines: ["a", "b", "c"], endsWithNewline: false });
  });

  it("doesn't make an empty last line from a final newline", () => {
    expect(splitLines("a\nb\n")).toEqual({ lines: ["a", "b"], endsWithNewline: true });
  });

  it("keeps blank lines in the middle", () => {
    expect(splitLines("a\n\nb").lines).toEqual(["a", "", "b"]);
  });

  it("reads empty text as no lines", () => {
    expect(splitLines("")).toEqual({ lines: [], endsWithNewline: false });
  });

  it("reads a lone newline as one empty line", () => {
    expect(splitLines("\n")).toEqual({ lines: [""], endsWithNewline: true });
  });
});
