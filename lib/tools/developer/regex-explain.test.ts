import { describe, expect, it } from "vitest";
import { captureGroupNames, explainFlags, explainRegex, explanationToText } from "./regex-explain";

const outline = (pattern: string, flags = "") => explanationToText(explainRegex(pattern, flags));

describe("explainRegex", () => {
  it("explains a date pattern with named groups and alternation", () => {
    expect(outline(String.raw`^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])$`)).toBe(
      [
        "^  Start of the text",
        String.raw`(?<year>\d{4})  Capture group "year" (#1):`,
        String.raw`  \d{4}  A digit (0–9), exactly 4 times`,
        '-  The text "-"',
        '(?<month>0[1-9]|1[0-2])  Capture group "month" (#2):',
        "  0[1-9]|1[0-2]  Either:",
        "    0[1-9]  Option 1:",
        '      0  The text "0"',
        "      [1-9]  One of: 1–9",
        "    1[0-2]  Option 2:",
        '      1  The text "1"',
        "      [0-2]  One of: 0–2",
        "$  End of the text",
      ].join("\n"),
    );
  });

  it("merges literal runs but keeps a quantified last character separate", () => {
    expect(outline("abc+")).toBe('ab  The text "ab"\nc+  The text "c", one or more times');
    expect(outline(String.raw`a\.b`)).toBe(String.raw`a\.b  The text "a.b"`);
  });

  it.each([
    ["x*", "zero or more times"],
    ["x+?", "one or more times, as few as possible"],
    ["x?", "optional"],
    ["x{3}", "exactly 3 times"],
    ["x{1}", "once"],
    ["x{2,}", "at least 2 times"],
    ["x{2,5}", "between 2 and 5 times"],
  ])("quantifier %s → %s", (pattern, text) => {
    expect(explainRegex(pattern, "")[0].text).toBe(`The text "x", ${text}`);
  });

  it("describes classes, sets, and anchors depending on flags", () => {
    expect(explainRegex(String.raw`[^a-z\d_-]`, "")[0].text).toBe('Any character except a–z, a digit, "_", "-"');
    expect(explainRegex("[]", "")[0].text).toBe("Nothing: an empty class never matches");
    expect(explainRegex("[^]", "")[0].text).toBe("Any character, including line breaks");
    expect(explainRegex(".", "")[0].text).toBe("Any character except a line break");
    expect(explainRegex(".", "s")[0].text).toBe("Any character");
    expect(explainRegex("^", "m")[0].text).toBe("Start of a line");
    expect(explainRegex(String.raw`\bfoo\B`, "").map((l) => l.text)).toEqual([
      "A word boundary",
      'The text "foo"',
      "Not a word boundary",
    ]);
  });

  it("describes lookarounds and backreferences", () => {
    expect(outline(String.raw`(?<=\$)\d+(?!px)`)).toBe(
      [
        String.raw`(?<=\$)  Preceded by (not included in the match):`,
        String.raw`  \$  The text "$"`,
        String.raw`\d+  A digit (0–9), one or more times`,
        "(?!px)  Not followed by:",
        '  px  The text "px"',
      ].join("\n"),
    );
    expect(explainRegex(String.raw`(['"]).*?\1`, "").map((l) => l.text)).toEqual([
      "Capture group #1:",
      "Any character except a line break, zero or more times, as few as possible",
      "The same text that group #1 matched",
    ]);
    expect(explainRegex(String.raw`(?<q>a)\k<q>`, "")[1].text).toBe('The same text that group "q" matched');
  });

  it("handles Unicode escapes and properties with the u flag", () => {
    expect(explainRegex(String.raw`\p{Lu}\P{Script=Greek}\u{1F600}`, "u").map((l) => l.text)).toEqual([
      "An uppercase letter",
      "Any character except a Greek script character",
      'The text "😀"',
    ]);
  });

  it("handles legacy (non-Unicode) syntax: octal escapes, literal braces, \\c quirks", () => {
    expect(explainRegex(String.raw`\101`, "")[0].text).toBe('The text "A"');
    expect(explainRegex("a{,2}", "")[0].text).toBe('The text "a{,2}"');
    expect(explainRegex(String.raw`\8`, "")[0].text).toBe('The text "8"');
    expect(explainRegex(String.raw`\c`, "")[0].text).toBe('The text "\\\\c"');
  });

  it("explains empty patterns and empty alternatives", () => {
    expect(outline("")).toBe("Nothing (matches an empty string)");
    expect(outline("a|")).toBe('a|  Either:\n  a  Option 1:\n    a  The text "a"\n  Option 2: nothing (matches an empty string)');
  });
});

// Deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const PIECES = [
  "a", "b", "0", "1", "9", "-", "_", " ", ".", "^", "$", "|", "*", "+", "?", "{2}", "{1,3}", "{,", "{", "}",
  "(", ")", "(?:", "(?=", "(?!", "(?<=", "(?<!", "(?<n>", "(?<m>", "[", "]", "[^", "\\", "\\d", "\\w", "\\s",
  "\\b", "\\B", "\\1", "\\2", "\\10", "\\k<n>", "\\x41", "\\u0041", "\\u{61}", "\\p{L}", "\\P{Lu}", "\\c", "\\cA",
  "\\0", "\\07", "\\.", "\\/", "\\-", "😀", "é",
];

describe("parser agrees with the RegExp engine", () => {
  it.each(["", "u"])("explains every valid pattern and numbers groups correctly (flags %j)", (flags) => {
    const rand = rng(flags ? 99 : 5);
    let valid = 0;
    for (let n = 0; n < 20000; n++) {
      const length = 1 + Math.floor(rand() * 8);
      let pattern = "";
      for (let k = 0; k < length; k++) pattern += PIECES[Math.floor(rand() * PIECES.length)];
      let re: RegExp;
      try {
        re = new RegExp(pattern, flags);
      } catch {
        continue;
      }
      valid++;
      expect(() => explainRegex(pattern, flags), pattern).not.toThrow();
      const groupCount = new RegExp(`${pattern}|`, flags).exec("")!.length - 1;
      expect(captureGroupNames(pattern).length, pattern).toBe(groupCount);
      void re;
    }
    expect(valid).toBeGreaterThan(2000);
  });
});

describe("explainFlags", () => {
  it("lists flags in the order given", () => {
    expect(explainFlags("gi").map((f) => f.flag)).toEqual(["g", "i"]);
  });
});
