import type { Row } from "./model";

/** Unchanged lines shown around each change unless the whole file is asked for. */
export const DEFAULT_CONTEXT = 3;

/** A run of rows to show, or a run of unchanged rows to hide. Indexes point into the full row list; `end` is exclusive. */
export type Block = { kind: "rows"; start: number; rows: Row[] } | { kind: "gap"; start: number; end: number };

/** Splits rows into shown runs (changes plus `context` lines around them) and hidden gaps. A view filter: no row is lost. */
export function collapseRows(rows: Row[], context: number | "all"): Block[] {
  if (rows.length === 0) return [];
  if (context === "all") return [{ kind: "rows", start: 0, rows }];

  const visible = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, i) => {
    if (row.kind !== "add" && row.kind !== "remove") return;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) visible[k] = true;
  });

  const blocks: Block[] = [];
  let start = 0;
  while (start < rows.length) {
    let end = start;
    while (end < rows.length && visible[end] === visible[start]) end++;
    // Hiding a single line saves nothing; the button would take as much room.
    if (visible[start] || end - start < 2) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "rows") last.rows = rows.slice(last.start, end);
      else blocks.push({ kind: "rows", start, rows: rows.slice(start, end) });
    } else {
      blocks.push({ kind: "gap", start, end });
    }
    start = end;
  }
  return blocks;
}
