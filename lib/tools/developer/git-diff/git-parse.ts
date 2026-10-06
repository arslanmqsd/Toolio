import { parse } from "diff2html/lib/diff-parser";
import { LineType, type DiffBlock, type DiffFile as ParsedFile, type DiffLine } from "diff2html/lib/types";
import { statsOf, type DiffFile, type FileStatus, type Hunk, type Row } from "@/lib/diff/model";
import { pairChanges } from "@/lib/diff/words";

export const MAX_GIT_DIFF_BYTES = 5 * 1024 * 1024;

export type GitParseResult = { ok: true; files: DiffFile[] } | { ok: false; reason: "empty" | "combined" | "too-large" };

/** Reads pasted `git diff`, `git show` or .patch text into DiffFiles, using diff2html's parser (not its renderer). */
export function parseGitDiff(text: string): GitParseResult {
  if (new TextEncoder().encode(text).length > MAX_GIT_DIFF_BYTES) return { ok: false, reason: "too-large" };
  if (/^diff --(?:cc|combined) /m.test(text)) return { ok: false, reason: "combined" };
  const parsed = parse(text);
  if (parsed.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, files: parsed.map(toDiffFile) };
}

/** How a file is named in the file list: renames as "old → new", deletions by the name they had. */
export function filePath(file: DiffFile): string {
  if (file.status === "renamed" || file.status === "copied") return `${file.oldName} → ${file.newName}`;
  return file.status === "deleted" ? file.oldName : file.newName;
}

/** The name to pick a syntax language from. */
export function languagePath(file: DiffFile): string {
  return file.status === "deleted" ? file.oldName : file.newName;
}

function statusOf(file: ParsedFile): FileStatus {
  if (file.isNew) return "added";
  if (file.isDeleted) return "deleted";
  if (file.isRename) return "renamed";
  if (file.isCopy) return "copied";
  if (file.blocks.length === 0 && file.oldMode !== undefined && file.newMode !== undefined) return "mode";
  return "modified";
}

function toDiffFile(file: ParsedFile): DiffFile {
  const hunks: Hunk[] = file.blocks.map((block, i) => {
    const hunk: Hunk = { header: block.header, rows: pairChanges(block.lines.map(toRow)) };
    const skipped = skippedBefore(file.blocks[i - 1], block);
    if (skipped) hunk.skippedBefore = skipped;
    return hunk;
  });
  return {
    oldName: file.oldName,
    newName: file.newName,
    status: statusOf(file),
    binary: Boolean(file.isBinary),
    hunks,
    stats: statsOf(hunks.flatMap((hunk) => hunk.rows)),
  };
}

function toRow(line: DiffLine): Row {
  const text = line.content.slice(1);
  if (line.type === LineType.INSERT) return { kind: "add", newNo: line.newNumber, text };
  if (line.type === LineType.DELETE) return { kind: "remove", oldNo: line.oldNumber, text };
  return { kind: "context", oldNo: line.oldNumber, newNo: line.newNumber, text };
}

/** Old-side lines between the previous hunk (or the file start) and this one, which the diff leaves out. */
function skippedBefore(previous: DiffBlock | undefined, block: DiffBlock): { from: number; to: number } | undefined {
  let from = 1;
  if (previous) {
    const oldLines = previous.lines.filter((line) => line.type !== LineType.INSERT).length;
    from = previous.oldStartLine + oldLines;
  }
  const to = block.oldStartLine - 1;
  // A first hunk starting at line 1, or a new file (old start 0), skips nothing; neither do touching hunks.
  return to >= from && previous ? { from, to } : undefined;
}
