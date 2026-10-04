import { describe, expect, it } from "vitest";
import { computeDiff, NO_OPTIONS, type CompareOptions } from "./compare";
import type { Row } from "./model";

function compare(original: string, modified: string, options: Partial<CompareOptions> = {}) {
  const result = computeDiff(original, modified, { ...NO_OPTIONS, ...options });
  if (!result.ok) throw new Error("timed out");
  return { ...result, rows: result.file.hunks[0].rows };
}

/** "kind oldNo newNo text", e.g. "r 2 - b" for removed line 2. */
const brief = (rows: Row[]) => rows.map((r) => `${r.kind[0]} ${r.oldNo ?? "-"} ${r.newNo ?? "-"} ${r.text}`);

describe("computeDiff", () => {
  it("numbers each side's lines", () => {
    const { rows, file } = compare("a\nb\nc", "a\nB\nc\nd");
    expect(brief(rows)).toEqual(["c 1 1 a", "r 2 - b", "a - 2 B", "c 3 3 c", "a - 4 d"]);
    expect(file.stats).toEqual({ added: 2, removed: 1, unchanged: 2 });
  });

  it("reports identical texts", () => {
    const { file, hiddenByOptions } = compare("a\nb", "a\nb");
    expect(file.stats).toEqual({ added: 0, removed: 0, unchanged: 2 });
    expect(hiddenByOptions).toBe(false);
  });

  it("treats Windows line endings like Unix ones", () => {
    expect(compare("a\r\nb\r\n", "a\nb\n").file.stats).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });

  it("shows every line as added when the original is empty", () => {
    expect(brief(compare("", "a\nb").rows)).toEqual(["a - 1 a", "a - 2 b"]);
  });

  it("ignores whitespace but keeps each side's text", () => {
    const { rows, hiddenByOptions } = compare("if (a) {\n\tx();\n}", "if (a){\n    x();\n}", { ignoreWhitespace: true });
    expect(brief(rows)).toEqual(["c 1 1 if (a){", "c 2 2     x();", "c 3 3 }"]);
    expect(rows[0].oldText).toBe("if (a) {");
    expect(rows[1].oldText).toBe("\tx();");
    expect(rows[2].oldText).toBeUndefined();
    expect(hiddenByOptions).toBe(true);
  });

  it("ignores case and shows the original casing", () => {
    expect(compare("Hello", "hello", { ignoreCase: true }).rows).toEqual([
      { kind: "context", oldNo: 1, newNo: 1, text: "hello", oldText: "Hello" },
    ]);
  });

  it("keeps ignored blank lines with their real numbers and leaves them out of the counts", () => {
    const { rows, file } = compare("a\n\nb", "a\nb\n\nc", { ignoreBlankLines: true });
    expect(brief(rows)).toEqual(["c 1 1 a", "i 2 - ", "c 3 2 b", "i - 3 ", "a - 4 c"]);
    expect(file.stats).toEqual({ added: 1, removed: 0, unchanged: 2 });
  });

  it("doesn't count a missing final newline as a change", () => {
    const { file } = compare("a\nb\n", "a\nb");
    expect(file.stats).toEqual({ added: 0, removed: 0, unchanged: 2 });
    expect(file.noNewlineAtEnd).toEqual({ old: false, new: true });
  });

  it("leaves out the newline note when a side is empty", () => {
    expect(compare("", "a").file.noNewlineAtEnd).toBeUndefined();
  });

  it("pairs changed lines and marks the changed words", () => {
    const { rows } = compare('function hello() {\n  console.log("Hello");\n}', "function hello(name) {\n  console.log(`Hello ${name}`);\n}");
    expect(brief(rows)).toEqual([
      "r 1 - function hello() {",
      'r 2 -   console.log("Hello");',
      "a - 1 function hello(name) {",
      "a - 2   console.log(`Hello ${name}`);",
      "c 3 3 }",
    ]);
    expect(rows[1].words).toEqual([
      { start: 14, end: 15 },
      { start: 20, end: 21 },
    ]);
    expect(rows[3].words).toEqual([
      { start: 14, end: 15 },
      { start: 20, end: 29 },
    ]);
  });

  it("gives up instead of hanging on very different texts", () => {
    const a = Array.from({ length: 20000 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 20000 }, (_, i) => `b${i}`).join("\n");
    expect(computeDiff(a, b, NO_OPTIONS, 1)).toEqual({ ok: false, reason: "timeout" });
  });
});
