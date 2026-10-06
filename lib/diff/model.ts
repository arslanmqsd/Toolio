/** The shared diff model: both diff tools turn their input into DiffFiles, and DiffView draws them. */

export type RowKind = "context" | "add" | "remove" | "ignored";

/** A changed stretch inside a line, as character offsets into the row's text. */
export interface WordRange {
  start: number;
  end: number;
}

export interface Row {
  kind: RowKind;
  /** Line number on the old side: set for context, remove, and ignored rows from the old side. */
  oldNo?: number;
  /** Line number on the new side: set for context, add, and ignored rows from the new side. */
  newNo?: number;
  /** The line exactly as written (the new side's, for context rows), without its newline or diff marker. */
  text: string;
  /** The old side's text of a context row, when ignore options matched two different lines. */
  oldText?: string;
  /** Changed words, only on removed/added rows paired with each other. */
  words?: WordRange[];
}

export interface Hunk {
  /** The "@@ -1,6 +1,6 @@ fn()" line of a pasted diff. Text diffs have none. */
  header?: string;
  /** Old-side lines a pasted diff leaves out before this hunk. */
  skippedBefore?: { from: number; to: number };
  rows: Row[];
}

export interface Stats {
  added: number;
  removed: number;
  unchanged: number;
}

export type FileStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "mode";

export interface DiffFile {
  oldName: string;
  newName: string;
  status: FileStatus;
  binary: boolean;
  /** Text diffs: one hunk holding every row. Pasted diffs: the hunks as pasted. */
  hunks: Hunk[];
  stats: Stats;
  /** Whether each side lacks a final newline. Only set when both sides have text. */
  noNewlineAtEnd?: { old: boolean; new: boolean };
}

/** Line counts for a list of rows. Ignored rows don't count. */
export function statsOf(rows: Row[]): Stats {
  const stats: Stats = { added: 0, removed: 0, unchanged: 0 };
  for (const row of rows) {
    if (row.kind === "add") stats.added++;
    else if (row.kind === "remove") stats.removed++;
    else if (row.kind === "context") stats.unchanged++;
  }
  return stats;
}
