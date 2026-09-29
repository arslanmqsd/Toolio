import { describe, expect, it } from "vitest";
import { findMatches } from "./regex-match";

describe("findMatches", () => {
  it("finds every match with g, with group values, names, and positions", () => {
    const { matches, truncated } = findMatches(String.raw`(?<k>\w+)=(\d+)?`, "g", "a=1 b= c=33");
    expect(truncated).toBe(false);
    expect(matches.map((m) => [m.value, m.start, m.end])).toEqual([
      ["a=1", 0, 3],
      ["b=", 4, 6],
      ["c=33", 7, 11],
    ]);
    expect(matches[0].groups).toEqual([
      { index: 1, name: "k", value: "a", start: 0, end: 1 },
      { index: 2, name: undefined, value: "1", start: 2, end: 3 },
    ]);
    // A group that didn't take part in the match.
    expect(matches[1].groups[1]).toEqual({ index: 2, name: undefined, value: undefined, start: undefined, end: undefined });
  });

  it("returns only the first match without g", () => {
    expect(findMatches(String.raw`\d`, "", "a1b2").matches.map((m) => m.value)).toEqual(["1"]);
  });

  it("steps past empty matches, by whole code points with u", () => {
    expect(findMatches("", "g", "ab").matches.map((m) => m.start)).toEqual([0, 1, 2]);
    expect(findMatches("", "gu", "😀a").matches.map((m) => m.start)).toEqual([0, 2, 3]);
    expect(findMatches("x*", "g", "axx").matches.map((m) => [m.start, m.value])).toEqual([
      [0, ""],
      [1, "xx"],
      [3, ""],
    ]);
  });

  it("agrees with String.prototype.matchAll", () => {
    const cases: [string, string, string][] = [
      [String.raw`\b\w`, "g", "hello big world"],
      ["(a)|(b)", "gi", "ABaB"],
      ["^.*$", "gm", "one\ntwo\n\nthree"],
      [String.raw`\p{L}+`, "gu", "héllo wörld 123 日本"],
      ["a", "gy", "aab"],
    ];
    for (const [pattern, flags, text] of cases) {
      const expected = [...text.matchAll(new RegExp(pattern, flags))].map((m) => [m.index, m[0]]);
      expect(findMatches(pattern, flags, text).matches.map((m) => [m.start, m.value])).toEqual(expected);
    }
  });

  it("stops at the limit and says so", () => {
    const { matches, truncated } = findMatches(".", "g", "abcdef", 4);
    expect(matches).toHaveLength(4);
    expect(truncated).toBe(true);
    expect(findMatches(".", "g", "abcd", 4).truncated).toBe(false);
  });
});
