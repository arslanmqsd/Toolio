import { describe, expect, it } from "vitest";
import { oneLinePreview } from "./one-line-preview";

describe("oneLinePreview", () => {
  it("collapses whitespace and line breaks", () => {
    expect(oneLinePreview("  {\n  \"a\": 1\n}  ", 80)).toBe('{ "a": 1 }');
  });

  it("cuts long text with an ellipsis", () => {
    expect(oneLinePreview("abcdef", 3)).toBe("abc…");
    expect(oneLinePreview("abc", 3)).toBe("abc");
  });
});
