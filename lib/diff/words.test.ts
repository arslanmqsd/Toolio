import { describe, expect, it } from "vitest";
import type { Row } from "./model";
import { pairChanges, wordRanges } from "./words";

describe("wordRanges", () => {
  it("marks the changed words on each side", () => {
    expect(wordRanges('  console.log("Hello");', "  console.log(`Hello ${name}`);")).toEqual({
      old: [
        { start: 14, end: 15 },
        { start: 20, end: 21 },
      ],
      new: [
        { start: 14, end: 15 },
        { start: 20, end: 29 },
      ],
    });
  });

  it("gives up when the lines share little", () => {
    expect(wordRanges("const a = 1;", "return foo(bar);")).toBeNull();
  });

  it("skips lines over the length limit", () => {
    expect(wordRanges("a".repeat(1001), "b")).toBeNull();
  });
});

describe("pairChanges", () => {
  it("pairs removed and added runs in order and leaves the surplus unpaired", () => {
    const rows: Row[] = [
      { kind: "remove", oldNo: 1, text: "let x = one;" },
      { kind: "remove", oldNo: 2, text: "let y = 2;" },
      { kind: "add", newNo: 1, text: "let x = two;" },
      { kind: "context", oldNo: 3, newNo: 2, text: "z" },
    ];
    const out = pairChanges(rows);
    expect(out[0].words).toEqual([{ start: 8, end: 11 }]);
    expect(out[2].words).toEqual([{ start: 8, end: 11 }]);
    expect(out[1].words).toBeUndefined();
    expect(rows[0].words).toBeUndefined();
  });

  it("doesn't pair across an unchanged row", () => {
    const out = pairChanges([
      { kind: "remove", oldNo: 1, text: "let x = one;" },
      { kind: "context", oldNo: 2, newNo: 1, text: "z" },
      { kind: "add", newNo: 2, text: "let x = two;" },
    ]);
    expect(out.every((row) => row.words === undefined)).toBe(true);
  });
});
