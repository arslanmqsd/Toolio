import { describe, expect, it } from "vitest";
import type { Row } from "./model";
import { toSplitLines } from "./split";

describe("toSplitLines", () => {
  it("puts unchanged rows on both sides and lines up removed with added rows", () => {
    const same: Row = { kind: "context", oldNo: 1, newNo: 1, text: "a" };
    const gone1: Row = { kind: "remove", oldNo: 2, text: "b" };
    const gone2: Row = { kind: "remove", oldNo: 3, text: "c" };
    const added: Row = { kind: "add", newNo: 2, text: "B" };
    expect(toSplitLines([same, gone1, gone2, added])).toEqual([
      { left: same, right: same },
      { left: gone1, right: added },
      { left: gone2, right: undefined },
    ]);
  });

  it("shows an addition on the right only", () => {
    const added: Row = { kind: "add", newNo: 1, text: "x" };
    expect(toSplitLines([added])).toEqual([{ right: added }]);
  });

  it("keeps ignored rows on their own side", () => {
    const oldBlank: Row = { kind: "ignored", oldNo: 2, text: "" };
    const newBlank: Row = { kind: "ignored", newNo: 3, text: "" };
    expect(toSplitLines([oldBlank, newBlank])).toEqual([{ left: oldBlank }, { right: newBlank }]);
  });
});
