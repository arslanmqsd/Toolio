import { describe, expect, it, vi } from "vitest";
import { highlightHunks, markChanged, parseHighlighted, piecesByLine, type Piece } from "./highlight";

describe("parseHighlighted", () => {
  it("reads highlight.js spans and escapes into pieces", () => {
    expect(
      parseHighlighted('<span class="hljs-keyword">const</span> s = <span class="hljs-string">&quot;x&lt;y&quot;</span> &amp;&amp; 1;'),
    ).toEqual([
      { text: "const", classes: ["hljs-keyword"] },
      { text: " s = ", classes: [] },
      { text: '"x<y"', classes: ["hljs-string"] },
      { text: " && 1;", classes: [] },
    ]);
  });

  it("gives text in nested spans every class", () => {
    expect(parseHighlighted('<span class="hljs-function"><span class="hljs-title function_">f</span>(x)</span>')).toEqual([
      { text: "f", classes: ["hljs-function", "hljs-title", "function_"] },
      { text: "(x)", classes: ["hljs-function"] },
    ]);
  });

  it("decodes the apostrophe escape", () => {
    expect(parseHighlighted("it&#x27;s")).toEqual([{ text: "it's", classes: [] }]);
  });

  it("keeps escaped HTML as literal text", () => {
    expect(parseHighlighted("&lt;script&gt;alert(1)&lt;/script&gt;")).toEqual([
      { text: "<script>alert(1)</script>", classes: [] },
    ]);
  });

  it("throws on markup highlight.js never writes", () => {
    expect(() => parseHighlighted("<b>x</b>")).toThrow();
  });
});

describe("piecesByLine", () => {
  it("carries a multi-line comment's classes onto the next line", () => {
    expect(piecesByLine([{ text: "/* a\n b */", classes: ["hljs-comment"] }, { text: " x", classes: [] }])).toEqual([
      [{ text: "/* a", classes: ["hljs-comment"] }],
      [
        { text: " b */", classes: ["hljs-comment"] },
        { text: " x", classes: [] },
      ],
    ]);
  });

  it("keeps empty lines", () => {
    expect(piecesByLine([{ text: "a\n\nb", classes: [] }])).toEqual([
      [{ text: "a", classes: [] }],
      [],
      [{ text: "b", classes: [] }],
    ]);
  });
});

describe("markChanged", () => {
  it("splits pieces at range edges and flags the changed parts", () => {
    expect(
      markChanged(
        [
          { text: "const x", classes: ["k"] },
          { text: " = 1", classes: [] },
        ],
        [{ start: 6, end: 9 }],
      ),
    ).toEqual([
      { text: "const ", classes: ["k"], changed: false },
      { text: "x", classes: ["k"], changed: true },
      { text: " =", classes: [], changed: true },
      { text: " 1", classes: [], changed: false },
    ]);
  });

  it("leaves pieces alone without ranges", () => {
    const pieces: Piece[] = [{ text: "a", classes: [] }];
    expect(markChanged(pieces, [])).toBe(pieces);
  });
});

describe("highlightHunks", () => {
  it("highlights each side of a hunk once and indexes the lines by number", () => {
    const highlight = vi.fn((code: string): Piece[] => [{ text: code.toUpperCase(), classes: ["x"] }]);
    const result = highlightHunks(
      [
        {
          rows: [
            { kind: "context", oldNo: 1, newNo: 1, text: "b", oldText: "a" },
            { kind: "remove", oldNo: 2, text: "c" },
            { kind: "add", newNo: 2, text: "d" },
          ],
        },
      ],
      highlight,
    );
    expect(highlight).toHaveBeenCalledTimes(2);
    expect(result.old.get(1)).toEqual([{ text: "A", classes: ["x"] }]);
    expect(result.old.get(2)).toEqual([{ text: "C", classes: ["x"] }]);
    expect(result.new.get(1)).toEqual([{ text: "B", classes: ["x"] }]);
    expect(result.new.get(2)).toEqual([{ text: "D", classes: ["x"] }]);
  });
});
