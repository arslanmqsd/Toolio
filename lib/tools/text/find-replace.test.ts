import { describe, expect, it } from "vitest";
import { findReplace, type FindReplaceRequest } from "./find-replace";

const run = (text: string, find: string, replace: string, options: Partial<FindReplaceRequest> = {}) =>
  findReplace({ text, find, replace, regex: false, matchCase: false, wholeWord: false, ...options });

describe("findReplace", () => {
  it("replaces plain text literally, ignoring case by default", () => {
    expect(run("Cat cat CAT", "cat", "dog")).toEqual({ output: "dog dog dog", count: 3 });
    expect(run("Cat cat", "cat", "dog", { matchCase: true })).toEqual({ output: "Cat dog", count: 1 });
    expect(run("a.b a+b", "a.b", "$1 $&")).toEqual({ output: "$1 $& a+b", count: 1 });
  });

  it("matches whole words only, including non-ASCII letters", () => {
    expect(run("cat concat cat_ café cat", "cat", "x", { wholeWord: true }).output).toBe("x concat cat_ café x");
    expect(run("über überall", "über", "x", { wholeWord: true }).output).toBe("x überall");
  });

  it("supports regex groups and escapes in the replacement", () => {
    expect(run("2026-10-25", "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1", { regex: true }).output).toBe("25/10/2026");
    expect(run("a, b, c", ", ", "\\n", { regex: true }).output).toBe("a\nb\nc");
    expect(run("one\ntwo", "^", "- ", { regex: true }).output).toBe("- one\n- two");
  });

  it("throws on an invalid pattern", () => {
    expect(() => run("x", "(", "", { regex: true })).toThrow(SyntaxError);
  });
});
