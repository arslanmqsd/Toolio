import type { Row } from "./model";

/** One line of split view: the old side's row on the left, the new side's on the right. */
export interface SplitLine {
  left?: Row;
  right?: Row;
}

/** Lines rows up for split view: unchanged rows on both sides, each removed row beside the added row that replaced it. */
export function toSplitLines(rows: Row[]): SplitLine[] {
  const out: SplitLine[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind === "context") {
      out.push({ left: row, right: row });
      i++;
    } else if (row.kind === "ignored") {
      out.push(row.oldNo !== undefined ? { left: row } : { right: row });
      i++;
    } else if (row.kind === "add") {
      out.push({ right: row });
      i++;
    } else {
      let removedEnd = i;
      while (removedEnd < rows.length && rows[removedEnd].kind === "remove") removedEnd++;
      let addedEnd = removedEnd;
      while (addedEnd < rows.length && rows[addedEnd].kind === "add") addedEnd++;
      const removed = removedEnd - i;
      const added = addedEnd - removedEnd;
      for (let k = 0; k < Math.max(removed, added); k++) {
        out.push({ left: k < removed ? rows[i + k] : undefined, right: k < added ? rows[removedEnd + k] : undefined });
      }
      i = addedEnd;
    }
  }
  return out;
}
