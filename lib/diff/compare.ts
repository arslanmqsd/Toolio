import { diffArrays } from "diff";
import { splitLines } from "./lines";
import { statsOf, type DiffFile, type Row } from "./model";
import { pairChanges } from "./words";

export interface CompareOptions {
  /** Compare lines with all whitespace removed, like `git diff -w`. */
  ignoreWhitespace: boolean;
  /** Leave blank lines out of the comparison. They still show, as ignored rows. */
  ignoreBlankLines: boolean;
  ignoreCase: boolean;
}

export const NO_OPTIONS: CompareOptions = { ignoreWhitespace: false, ignoreBlankLines: false, ignoreCase: false };

export const COMPARE_TIMEOUT_MS = 1000;

export type CompareResult =
  | { ok: true; file: DiffFile; hiddenByOptions: boolean }
  | { ok: false; reason: "timeout" };

interface Line {
  no: number;
  text: string;
  key: string;
}

function keyOf(text: string, options: CompareOptions): string {
  let key = text;
  if (options.ignoreWhitespace) key = key.replace(/\s+/g, "");
  if (options.ignoreCase) key = key.toLowerCase();
  return key;
}

/**
 * Line diff of two texts. Lines are compared by a key that the ignore options normalise, but every row keeps
 * its side's original text and real line number.
 */
export function computeDiff(
  original: string,
  modified: string,
  options: CompareOptions,
  timeout = COMPARE_TIMEOUT_MS,
): CompareResult {
  const oldSplit = splitLines(original);
  const newSplit = splitLines(modified);
  const number = (lines: string[]): Line[] => lines.map((text, i) => ({ no: i + 1, text, key: keyOf(text, options) }));
  const oldLines = number(oldSplit.lines);
  const newLines = number(newSplit.lines);

  const isBlank = (line: Line) => options.ignoreBlankLines && line.text.trim() === "";
  const oldKept = oldLines.filter((line) => !isBlank(line));
  const newKept = newLines.filter((line) => !isBlank(line));

  const parts = diffArrays(
    oldKept.map((line) => line.key),
    newKept.map((line) => line.key),
    { timeout },
  );
  if (!parts) return { ok: false, reason: "timeout" };

  // jsdiff hands back keys (and the new side's key for common runs), so walk both sides by count for the originals.
  const compared: Row[] = [];
  let i = 0;
  let j = 0;
  for (const part of parts) {
    for (let k = 0; k < part.count; k++) {
      if (part.removed) {
        const line = oldKept[i++];
        compared.push({ kind: "remove", oldNo: line.no, text: line.text });
      } else if (part.added) {
        const line = newKept[j++];
        compared.push({ kind: "add", newNo: line.no, text: line.text });
      } else {
        const oldLine = oldKept[i++];
        const newLine = newKept[j++];
        const row: Row = { kind: "context", oldNo: oldLine.no, newNo: newLine.no, text: newLine.text };
        if (oldLine.text !== newLine.text) row.oldText = oldLine.text;
        compared.push(row);
      }
    }
  }

  const rows = withIgnoredLines(compared, oldLines.filter(isBlank), newLines.filter(isBlank));
  const paired = pairChanges(rows);
  const stats = statsOf(paired);
  const hiddenByOptions = stats.added + stats.removed === 0 && oldSplit.lines.join("\n") !== newSplit.lines.join("\n");

  const file: DiffFile = {
    oldName: "Original",
    newName: "Modified",
    status: "modified",
    binary: false,
    hunks: [{ rows: paired }],
    stats,
  };
  if (oldSplit.lines.length > 0 && newSplit.lines.length > 0) {
    file.noNewlineAtEnd = { old: !oldSplit.endsWithNewline, new: !newSplit.endsWithNewline };
  }
  return { ok: true, file, hiddenByOptions };
}

/** Puts the blank lines left out of the comparison back, in line order on their own side. */
function withIgnoredLines(compared: Row[], oldBlanks: Line[], newBlanks: Line[]): Row[] {
  const rows: Row[] = [];
  let o = 0;
  let n = 0;
  const flushOld = (before: number) => {
    for (; o < oldBlanks.length && oldBlanks[o].no < before; o++) {
      rows.push({ kind: "ignored", oldNo: oldBlanks[o].no, text: oldBlanks[o].text });
    }
  };
  const flushNew = (before: number) => {
    for (; n < newBlanks.length && newBlanks[n].no < before; n++) {
      rows.push({ kind: "ignored", newNo: newBlanks[n].no, text: newBlanks[n].text });
    }
  };
  for (const row of compared) {
    if (row.oldNo !== undefined) flushOld(row.oldNo);
    if (row.newNo !== undefined) flushNew(row.newNo);
    rows.push(row);
  }
  flushOld(Infinity);
  flushNew(Infinity);
  return rows;
}
