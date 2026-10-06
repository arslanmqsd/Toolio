import { describe, expect, it } from "vitest";
import { collapseRows, type Block } from "./hunks";
import type { Row } from "./model";

const same = (n: number): Row => ({ kind: "context", oldNo: n, newNo: n, text: `line ${n}` });
const added: Row = { kind: "add", newNo: 99, text: "new" };
const sames = (count: number) => Array.from({ length: count }, (_, i) => same(i + 1));
const shape = (blocks: Block[]) =>
  blocks.map((b) => (b.kind === "gap" ? `gap ${b.start}-${b.end}` : `rows ${b.start}-${b.start + b.rows.length}`));

describe("collapseRows", () => {
  it("keeps 3 lines around a change and hides the rest", () => {
    const rows = [...sames(10), added, ...sames(10)];
    expect(shape(collapseRows(rows, 3))).toEqual(["gap 0-7", "rows 7-14", "gap 14-21"]);
  });

  it("shows a single hidden line instead of a gap", () => {
    expect(shape(collapseRows([...sames(4), added], 3))).toEqual(["rows 0-5"]);
  });

  it("shows everything for 'all'", () => {
    const rows = [...sames(10), added];
    expect(collapseRows(rows, "all")).toEqual([{ kind: "rows", start: 0, rows }]);
  });

  it("hides an unchanged file in one gap", () => {
    expect(shape(collapseRows(sames(5), 3))).toEqual(["gap 0-5"]);
  });

  it("handles changes at the start and the end", () => {
    expect(shape(collapseRows([added, ...sames(10), added], 3))).toEqual(["rows 0-4", "gap 4-8", "rows 8-12"]);
  });

  it("returns nothing for no rows", () => {
    expect(collapseRows([], 3)).toEqual([]);
  });
});
