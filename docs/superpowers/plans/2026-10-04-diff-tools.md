# Diff Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two developer tools — Text Diff Checker and Git Diff Viewer — on one shared diff core and renderer.

**Architecture:** Pure logic in `lib/tools/developer/diff/` produces a shared `DiffFile` model (text diffs via jsdiff's
`diffArrays`, pasted git diffs via diff2html's parser). One React renderer, `DiffView`, draws any `DiffFile` split or
unified, with changed-word marks and lazy highlight.js colors turned into plain React spans.

**Tech Stack:** Next.js 14.2 app router, React 18, TypeScript strict, Tailwind 3.4, Vitest 5, `diff` ^9,
`diff2html` 3.4.x (parser only), `highlight.js` ^11.

**Spec:** `docs/superpowers/specs/2026-10-04-diff-tools-design.md`

## Global Constraints

- `diff` (jsdiff) `^9`; `diff2html` `3.4.x` imported **only** as `diff2html/lib/diff-parser` and `diff2html/lib/types`; `highlight.js` `^11` imported only as `highlight.js/lib/core` and `highlight.js/lib/languages/<id>`, via dynamic `import()`.
- No `dangerouslySetInnerHTML` anywhere in the diff tools.
- Nothing in `compare.ts`, `hunks.ts`, `words.ts`, `split.ts`, `highlight.ts`, `DiffView`, `DiffStats` knows about git.
- Colors only through CSS tokens defined for dark (`:root`) and light (`:root[data-theme="light"]`) in `app/globals.css`.
- Layout works at 375px with no page-level horizontal scroll; split layout only from 640px (`sm`) up.
- Text Diff Checker file limit 2 MB; Git Diff Viewer input/file limit 5 MB; NUL byte in the first 8 KB = binary.
- jsdiff timeout 1,000 ms; render cap 2,000 rows; highlighting off above 5,000 lines; Git Diff Viewer collapses files over 500 rows.
- Copy text (exact): "Paste or drop text into both panels.", "No differences.", "Some differences are hidden by the ignore options.", "These texts are too different to compare quickly.", "No diff found", "Paste the output of git diff, git show, or a .patch file.", "Lines X–Y aren't in this diff".
- Logic is unit-tested with Vitest; components are not (repo convention). Never run `next build` while `next dev` is running (check `ps aux | grep "[n]ext dev"`).

## Review Focus

1. Windows (CRLF) text pasted against the same LF text → "No differences" (test in Task 3).
2. A `git diff` copied with CRLF line endings → parses exactly like the LF version (test in Task 7).
3. One side empty in the Text Diff Checker → every line of the other side shown as added, numbered from 1 (test in Task 3).
4. File paths with spaces in a pasted diff → shown intact (test in Task 7).
5. Code containing HTML (`<script>`) → shown as literal text, never markup (test in Task 5).

## Spec refinements made while planning

- **Build order:** the pure highlighting modules (Task 5) and `useHighlighters` (Task 6) are built before the tools so each tool is written once; both tools still land as independent tasks.
- **Context rows carry both texts:** `Row.oldText` is set on a context row when the old line differs from the new one (only possible with ignore options), so split view shows each side as typed.
- **Hunk gaps:** `Hunk.skippedBefore?: { from; to }` (old-side line range not in a pasted diff) replaces deriving gaps in the renderer.
- **No-newline marker in git diffs:** diff2html drops `\ No newline at end of file` lines before parsing, so the Git Diff Viewer does not show that note (the Text Diff Checker still does).
- **Word marks threshold:** a removed/added pair gets word marks only when at least 40% of the longer line's non-space characters are shared; otherwise the whole line is just added/removed (avoids confetti on unrelated lines).
- **Long lines wrap** inside the diff (`overflow-wrap:anywhere`) instead of scrolling horizontally: a single scroll region can't serve both columns of split view. Still no page-level scroll.
- **Small mobile view toggle:** below 640px the Split option is removed from the View control (SegmentedControl has no disabled option) and rendering falls back to unified.
- **Shared UI additions:** `InputPanel`/`OutputPanel` get a `wide` prop (`lg:col-span-full`), `FileDrop` gets a `compact` prop, new `lib/hooks/useMediaQuery.ts`.
- **Patch names** are written as `a/<name>` / `b/<name>` so `git apply` (default `-p1`) accepts the patch.

---

## File map

```text
lib/tools/developer/diff/
├── model.ts          # types + statsOf                                   (Task 1)
├── lines.ts          # splitLines                                        (Task 1)
├── text-file.ts      # checkTextFile (pure) + readTextFile (File)        (Task 1)
├── words.ts          # wordRanges, pairChanges                           (Task 2)
├── split.ts          # toSplitLines                                      (Task 2)
├── compare.ts        # computeDiff                                       (Task 3)
├── hunks.ts          # collapseRows, DEFAULT_CONTEXT                     (Task 4)
├── patch.ts          # generatePatch, patchFileName                      (Task 4)
├── language.ts       # LANGUAGES, languageForFile                        (Task 5)
├── highlight.ts      # Piece, markChanged, parseHighlighted, …           (Task 5)
├── git-sample.ts     # GIT_DIFF_SAMPLE                                   (Task 7)
└── git-parse.ts      # parseGitDiff, filePath, languagePath              (Task 7)
lib/hooks/useMediaQuery.ts                                                (Task 6)
components/tools/developer/diff/{DiffView,DiffStats}.tsx, useHighlighters.ts  (Task 6)
components/tools/developer/TextDiffChecker.tsx                            (Task 8)
components/tools/developer/GitDiffViewer.tsx                              (Task 9)
registry/tools/developer/{text-diff-checker,git-diff-viewer}.ts           (Tasks 8, 9)
Modified: app/globals.css, components/tool-shell/ToolPanels.tsx, components/ui/FileDrop.tsx,
          registry/data-types.ts, registry/tools/developer/index.ts, registry/registry.test.ts,
          components/catalog/icons.tsx, components/workbench/detectors.ts (+ test)
```

---

### Task 1: Dependencies, model, line splitting, text-file checks

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)
- Create: `lib/tools/developer/diff/model.ts`, `lib/tools/developer/diff/lines.ts`, `lib/tools/developer/diff/text-file.ts`
- Test: `lib/tools/developer/diff/model.test.ts`, `lib/tools/developer/diff/lines.test.ts`, `lib/tools/developer/diff/text-file.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type RowKind = "context" | "add" | "remove" | "ignored"`
  - `interface WordRange { start: number; end: number }`
  - `interface Row { kind: RowKind; oldNo?: number; newNo?: number; text: string; oldText?: string; words?: WordRange[] }`
  - `interface Hunk { header?: string; skippedBefore?: { from: number; to: number }; rows: Row[] }`
  - `interface Stats { added: number; removed: number; unchanged: number }`
  - `type FileStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "mode"`
  - `interface DiffFile { oldName: string; newName: string; status: FileStatus; binary: boolean; hunks: Hunk[]; stats: Stats; noNewlineAtEnd?: { old: boolean; new: boolean } }`
  - `statsOf(rows: Row[]): Stats`
  - `splitLines(text: string): { lines: string[]; endsWithNewline: boolean }`
  - `checkTextFile(size: number, head: Uint8Array, maxBytes: number): string | null`
  - `readTextFile(file: File, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false; error: string }>`

- [ ] **Step 1: Install dependencies**

Run: `npm install diff@^9 diff2html@3.4.56 highlight.js@^11`
Expected: `package.json` dependencies gain `diff`, `diff2html`, `highlight.js`; exit 0.

- [ ] **Step 2: Write the failing tests**

`lib/tools/developer/diff/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { statsOf } from "./model";

describe("statsOf", () => {
  it("counts added, removed and unchanged rows, and leaves ignored rows out", () => {
    expect(
      statsOf([
        { kind: "context", oldNo: 1, newNo: 1, text: "a" },
        { kind: "add", newNo: 2, text: "b" },
        { kind: "remove", oldNo: 2, text: "c" },
        { kind: "ignored", oldNo: 3, text: "" },
      ]),
    ).toEqual({ added: 1, removed: 1, unchanged: 1 });
  });
});
```

`lib/tools/developer/diff/lines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { splitLines } from "./lines";

describe("splitLines", () => {
  it("splits on LF and CRLF", () => {
    expect(splitLines("a\r\nb\nc")).toEqual({ lines: ["a", "b", "c"], endsWithNewline: false });
  });

  it("doesn't make an empty last line from a final newline", () => {
    expect(splitLines("a\nb\n")).toEqual({ lines: ["a", "b"], endsWithNewline: true });
  });

  it("keeps blank lines in the middle", () => {
    expect(splitLines("a\n\nb").lines).toEqual(["a", "", "b"]);
  });

  it("reads empty text as no lines", () => {
    expect(splitLines("")).toEqual({ lines: [], endsWithNewline: false });
  });

  it("reads a lone newline as one empty line", () => {
    expect(splitLines("\n")).toEqual({ lines: [""], endsWithNewline: true });
  });
});
```

`lib/tools/developer/diff/text-file.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkTextFile } from "./text-file";

const MB = 1024 * 1024;

describe("checkTextFile", () => {
  it("accepts small text", () => {
    expect(checkTextFile(5, new TextEncoder().encode("hello"), 2 * MB)).toBeNull();
  });

  it("rejects files over the limit", () => {
    expect(checkTextFile(2 * MB + 1, new Uint8Array(), 2 * MB)).toBe("This file is over 2 MB.");
  });

  it("rejects files with a NUL byte as binary", () => {
    expect(checkTextFile(4, new Uint8Array([0x89, 0x50, 0x00, 0x47]), 2 * MB)).toBe(
      "This looks like a binary file, not text.",
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/tools/developer/diff`
Expected: FAIL — `Failed to resolve import "./model"` (and `./lines`, `./text-file`).

- [ ] **Step 4: Write the implementation**

`lib/tools/developer/diff/model.ts`:

```ts
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
```

`lib/tools/developer/diff/lines.ts`:

```ts
/** Splits text into lines on LF or CRLF. A final newline ends the last line rather than starting an empty one. */
export function splitLines(text: string): { lines: string[]; endsWithNewline: boolean } {
  if (text === "") return { lines: [], endsWithNewline: false };
  const lines = text.split(/\r\n|\n/);
  const endsWithNewline = lines[lines.length - 1] === "";
  if (endsWithNewline) lines.pop();
  return { lines, endsWithNewline };
}
```

`lib/tools/developer/diff/text-file.ts`:

```ts
const MB = 1024 * 1024;
/** Bytes checked for a NUL byte, which text files don't contain. */
const SNIFF_BYTES = 8192;

/** Why a file can't be read as text, or null when it can. `head` is the file's first bytes. */
export function checkTextFile(size: number, head: Uint8Array, maxBytes: number): string | null {
  if (size > maxBytes) return `This file is over ${Math.round(maxBytes / MB)} MB.`;
  if (head.includes(0)) return "This looks like a binary file, not text.";
  return null;
}

/** Reads a dropped or chosen file as UTF-8 text, refusing large and binary files. */
export async function readTextFile(
  file: File,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const error = checkTextFile(file.size, head, maxBytes);
    return error ? { ok: false, error } : { ok: true, text: await file.text() };
  } catch {
    return { ok: false, error: "The browser couldn't read this file." };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/tools/developer/diff`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/tools/developer/diff
git commit -m "feat(diff): diff model, line splitting and text file checks"
```

---

### Task 2: Changed-word ranges, pairing and split-view lines

**Files:**
- Create: `lib/tools/developer/diff/words.ts`, `lib/tools/developer/diff/split.ts`
- Test: `lib/tools/developer/diff/words.test.ts`, `lib/tools/developer/diff/split.test.ts`

**Interfaces:**
- Consumes: `Row`, `WordRange` from `model.ts`.
- Produces:
  - `MAX_WORD_DIFF_LENGTH = 1000`
  - `wordRanges(oldText: string, newText: string): { old: WordRange[]; new: WordRange[] } | null`
  - `pairChanges(rows: Row[]): Row[]` (returns copies; input not mutated)
  - `interface SplitLine { left?: Row; right?: Row }`
  - `toSplitLines(rows: Row[]): SplitLine[]`

- [ ] **Step 1: Write the failing tests**

`lib/tools/developer/diff/words.test.ts`:

```ts
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
```

`lib/tools/developer/diff/split.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/tools/developer/diff/words.test.ts lib/tools/developer/diff/split.test.ts`
Expected: FAIL — `Failed to resolve import "./words"` / `"./split"`.

- [ ] **Step 3: Write the implementation**

`lib/tools/developer/diff/words.ts`:

```ts
import { diffWordsWithSpace } from "diff";
import type { Row, WordRange } from "./model";

/** Longer lines get no word marks: word-diffing them is slow and the marks are unreadable anyway. */
export const MAX_WORD_DIFF_LENGTH = 1000;
/** Share of the longer line's non-space characters two lines must have in common to get word marks. */
const MIN_SHARED = 0.4;

const visibleLength = (text: string) => text.replace(/\s/g, "").length;

/** The changed stretches of a removed line and the added line that replaced it, or null when marks wouldn't help. */
export function wordRanges(oldText: string, newText: string): { old: WordRange[]; new: WordRange[] } | null {
  if (oldText.length > MAX_WORD_DIFF_LENGTH || newText.length > MAX_WORD_DIFF_LENGTH) return null;

  const old: WordRange[] = [];
  const added: WordRange[] = [];
  let oldPos = 0;
  let newPos = 0;
  let shared = 0;
  for (const part of diffWordsWithSpace(oldText, newText)) {
    const length = part.value.length;
    if (part.removed) {
      old.push({ start: oldPos, end: oldPos + length });
      oldPos += length;
    } else if (part.added) {
      added.push({ start: newPos, end: newPos + length });
      newPos += length;
    } else {
      oldPos += length;
      newPos += length;
      shared += visibleLength(part.value);
    }
  }

  const longer = Math.max(visibleLength(oldText), visibleLength(newText));
  if (longer > 0 && shared / longer < MIN_SHARED) return null;
  return { old, new: added };
}

/**
 * Pairs each run of removed rows directly followed by added rows, first with first, and gives each pair its
 * changed-word ranges. Rows without a partner stay as they are. Returns new row objects.
 */
export function pairChanges(rows: Row[]): Row[] {
  const out = rows.map((row) => ({ ...row }));
  let i = 0;
  while (i < out.length) {
    if (out[i].kind !== "remove") {
      i++;
      continue;
    }
    let removedEnd = i;
    while (removedEnd < out.length && out[removedEnd].kind === "remove") removedEnd++;
    let addedEnd = removedEnd;
    while (addedEnd < out.length && out[addedEnd].kind === "add") addedEnd++;

    const pairs = Math.min(removedEnd - i, addedEnd - removedEnd);
    for (let k = 0; k < pairs; k++) {
      const ranges = wordRanges(out[i + k].text, out[removedEnd + k].text);
      if (ranges) {
        out[i + k].words = ranges.old;
        out[removedEnd + k].words = ranges.new;
      }
    }
    i = Math.max(addedEnd, i + 1);
  }
  return out;
}
```

`lib/tools/developer/diff/split.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/tools/developer/diff/words.test.ts lib/tools/developer/diff/split.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tools/developer/diff/words.ts lib/tools/developer/diff/words.test.ts lib/tools/developer/diff/split.ts lib/tools/developer/diff/split.test.ts
git commit -m "feat(diff): changed-word ranges, pairing and split-view lines"
```

---

### Task 3: `computeDiff`

**Files:**
- Create: `lib/tools/developer/diff/compare.ts`
- Test: `lib/tools/developer/diff/compare.test.ts`

**Interfaces:**
- Consumes: `splitLines` (lines.ts), `pairChanges` (words.ts), `statsOf`, `DiffFile`, `Row` (model.ts).
- Produces:
  - `interface CompareOptions { ignoreWhitespace: boolean; ignoreBlankLines: boolean; ignoreCase: boolean }`
  - `NO_OPTIONS: CompareOptions` (all false)
  - `COMPARE_TIMEOUT_MS = 1000`
  - `type CompareResult = { ok: true; file: DiffFile; hiddenByOptions: boolean } | { ok: false; reason: "timeout" }`
  - `computeDiff(original: string, modified: string, options: CompareOptions, timeout?: number): CompareResult` — `file.hunks` is always exactly one hunk; `oldName` "Original", `newName` "Modified", `status` "modified", `binary` false.

- [ ] **Step 1: Write the failing test**

`lib/tools/developer/diff/compare.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/tools/developer/diff/compare.test.ts`
Expected: FAIL — `Failed to resolve import "./compare"`.

- [ ] **Step 3: Write the implementation**

`lib/tools/developer/diff/compare.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/tools/developer/diff/compare.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tools/developer/diff/compare.ts lib/tools/developer/diff/compare.test.ts
git commit -m "feat(diff): computeDiff with ignore options and real line numbers"
```

---

### Task 4: Collapsing unchanged lines and patch output

**Files:**
- Create: `lib/tools/developer/diff/hunks.ts`, `lib/tools/developer/diff/patch.ts`
- Test: `lib/tools/developer/diff/hunks.test.ts`, `lib/tools/developer/diff/patch.test.ts`

**Interfaces:**
- Consumes: `Row` (model.ts), `COMPARE_TIMEOUT_MS` (compare.ts).
- Produces:
  - `DEFAULT_CONTEXT = 3`
  - `type Block = { kind: "rows"; start: number; rows: Row[] } | { kind: "gap"; start: number; end: number }` (indexes into the row list; `end` exclusive)
  - `collapseRows(rows: Row[], context: number | "all"): Block[]`
  - `generatePatch(original: string, modified: string, oldName: string, newName: string, timeout?: number): string | null` — `""` when identical, `null` on timeout.
  - `patchFileName(newName: string): string`

- [ ] **Step 1: Write the failing tests**

`lib/tools/developer/diff/hunks.test.ts`:

```ts
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
```

`lib/tools/developer/diff/patch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generatePatch, patchFileName } from "./patch";

describe("generatePatch", () => {
  it("writes a unified patch that git apply accepts", () => {
    expect(generatePatch("a\nb\n", "a\nc\n", "original.txt", "modified.txt")).toBe(
      "--- a/original.txt\n+++ b/modified.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n",
    );
  });

  it("returns an empty string for identical texts", () => {
    expect(generatePatch("a\n", "a\n", "o", "m")).toBe("");
  });

  it("marks a missing final newline", () => {
    expect(generatePatch("a", "b", "o", "m")).toContain("\\ No newline at end of file");
  });

  it("compares exactly, whitespace included", () => {
    expect(generatePatch("a b\n", "a  b\n", "o", "m")).toContain("-a b\n+a  b\n");
  });

  it("returns null when the texts are too different to compare quickly", () => {
    const a = Array.from({ length: 20000 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 20000 }, (_, i) => `b${i}`).join("\n");
    expect(generatePatch(a, b, "o", "m", 1)).toBeNull();
  });
});

describe("patchFileName", () => {
  it.each([
    ["modified.txt", "modified.patch"],
    ["src/app.test.ts", "src/app.test.patch"],
    ["Makefile", "Makefile.patch"],
    [".env", "changes.patch"],
  ])("%s → %s", (name, expected) => {
    expect(patchFileName(name)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/tools/developer/diff/hunks.test.ts lib/tools/developer/diff/patch.test.ts`
Expected: FAIL — `Failed to resolve import "./hunks"` / `"./patch"`.

- [ ] **Step 3: Write the implementation**

`lib/tools/developer/diff/hunks.ts`:

```ts
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
```

`lib/tools/developer/diff/patch.ts`:

```ts
import { createTwoFilesPatch } from "diff";
import { COMPARE_TIMEOUT_MS } from "./compare";

/**
 * A unified patch of the exact texts (no ignore options, so it applies cleanly). Names get git's a/ and b/
 * prefixes so `git apply` takes it as is. "" when the texts are identical, null when diffing timed out.
 */
export function generatePatch(
  original: string,
  modified: string,
  oldName: string,
  newName: string,
  timeout = COMPARE_TIMEOUT_MS,
): string | null {
  if (original === modified) return "";
  const patch = createTwoFilesPatch(`a/${oldName}`, `b/${newName}`, original, modified, undefined, undefined, { timeout });
  if (patch === undefined) return null;
  // jsdiff starts with a "=====" separator line that git doesn't write.
  return patch.replace(/^=+\n/, "");
}

/** Download name for a patch: the modified file's name with its extension swapped for .patch. */
export function patchFileName(newName: string): string {
  const stem = newName.replace(/\.[^./]*$/, "");
  return `${stem || "changes"}.patch`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/tools/developer/diff/hunks.test.ts lib/tools/developer/diff/patch.test.ts`
Expected: PASS — 15 tests. (If `createTwoFilesPatch`'s types reject `{ timeout }` or `undefined` headers, check `node_modules/diff/libcjs/patch/create.d.ts` for the v9 signature and adapt the call — the behaviour pinned by the tests is what matters; ledger the ruling.)

- [ ] **Step 5: Commit**

```bash
git add lib/tools/developer/diff/hunks.ts lib/tools/developer/diff/hunks.test.ts lib/tools/developer/diff/patch.ts lib/tools/developer/diff/patch.test.ts
git commit -m "feat(diff): collapse unchanged lines and generate patches"
```

---

### Task 5: Languages and highlight pieces

**Files:**
- Create: `lib/tools/developer/diff/language.ts`, `lib/tools/developer/diff/highlight.ts`
- Test: `lib/tools/developer/diff/language.test.ts`, `lib/tools/developer/diff/highlight.test.ts`

**Interfaces:**
- Consumes: `Hunk`, `WordRange` (model.ts).
- Produces:
  - `LANGUAGES: readonly { id: LanguageId; label: string }[]` (11 entries)
  - `type LanguageId = "javascript" | "typescript" | "json" | "css" | "xml" | "python" | "go" | "sql" | "yaml" | "bash" | "markdown"`
  - `languageForFile(path: string): LanguageId | null`
  - `interface Piece { text: string; classes: string[]; changed?: boolean }`
  - `type Highlight = (code: string) => Piece[]`
  - `interface SideHighlights { old: Map<number, Piece[]>; new: Map<number, Piece[]> }`
  - `HIGHLIGHT_LINE_LIMIT = 5000`
  - `plainPieces(text: string): Piece[]`
  - `markChanged(pieces: Piece[], ranges: WordRange[]): Piece[]`
  - `parseHighlighted(html: string): Piece[]`
  - `piecesByLine(pieces: Piece[]): Piece[][]`
  - `highlightHunks(hunks: Hunk[], highlight: Highlight): SideHighlights`

- [ ] **Step 1: Write the failing tests**

`lib/tools/developer/diff/language.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LANGUAGES, languageForFile } from "./language";

describe("languageForFile", () => {
  it.each([
    ["src/app.ts", "typescript"],
    ["App.TSX", "typescript"],
    ["index.mjs", "javascript"],
    ["data.json", "json"],
    ["styles.scss", "css"],
    ["page.html", "xml"],
    ["main.py", "python"],
    ["main.go", "go"],
    ["query.sql", "sql"],
    [".github/ci.yml", "yaml"],
    ["deploy.sh", "bash"],
    ["home/.zshrc", "bash"],
    ["README.md", "markdown"],
  ])("%s → %s", (path, expected) => {
    expect(languageForFile(path)).toBe(expected);
  });

  it.each([["Dockerfile"], ["notes.txt"], [".env"], ["Makefile"]])("%s → plain text", (path) => {
    expect(languageForFile(path)).toBeNull();
  });

  it("offers 11 distinct languages", () => {
    expect(new Set(LANGUAGES.map((l) => l.id)).size).toBe(11);
  });
});
```

`lib/tools/developer/diff/highlight.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { highlightHunks, markChanged, parseHighlighted, piecesByLine, type Piece } from "./highlight";

describe("parseHighlighted", () => {
  it("reads highlight.js spans and escapes into pieces", () => {
    expect(
      parseHighlighted('<span class="hljs-keyword">const</span> s = <span class="hljs-string">&quot;x&lt;y&quot;</span> &amp;&amp; 1;'),
    ).toEqual([
      { text: "const", classes: ["hljs-keyword"] },
      { text: " s = ", classes: [] },
      { text: '"x<y"', classes: ["hljs-string"] },
      { text: " && 1;", classes: [] },
    ]);
  });

  it("gives text in nested spans every class", () => {
    expect(parseHighlighted('<span class="hljs-function"><span class="hljs-title function_">f</span>(x)</span>')).toEqual([
      { text: "f", classes: ["hljs-function", "hljs-title", "function_"] },
      { text: "(x)", classes: ["hljs-function"] },
    ]);
  });

  it("decodes the apostrophe escape", () => {
    expect(parseHighlighted("it&#x27;s")).toEqual([{ text: "it's", classes: [] }]);
  });

  it("keeps escaped HTML as literal text", () => {
    expect(parseHighlighted("&lt;script&gt;alert(1)&lt;/script&gt;")).toEqual([
      { text: "<script>alert(1)</script>", classes: [] },
    ]);
  });

  it("throws on markup highlight.js never writes", () => {
    expect(() => parseHighlighted("<b>x</b>")).toThrow();
  });
});

describe("piecesByLine", () => {
  it("carries a multi-line comment's classes onto the next line", () => {
    expect(piecesByLine([{ text: "/* a\n b */", classes: ["hljs-comment"] }, { text: " x", classes: [] }])).toEqual([
      [{ text: "/* a", classes: ["hljs-comment"] }],
      [
        { text: " b */", classes: ["hljs-comment"] },
        { text: " x", classes: [] },
      ],
    ]);
  });

  it("keeps empty lines", () => {
    expect(piecesByLine([{ text: "a\n\nb", classes: [] }])).toEqual([
      [{ text: "a", classes: [] }],
      [],
      [{ text: "b", classes: [] }],
    ]);
  });
});

describe("markChanged", () => {
  it("splits pieces at range edges and flags the changed parts", () => {
    expect(
      markChanged(
        [
          { text: "const x", classes: ["k"] },
          { text: " = 1", classes: [] },
        ],
        [{ start: 6, end: 9 }],
      ),
    ).toEqual([
      { text: "const ", classes: ["k"], changed: false },
      { text: "x", classes: ["k"], changed: true },
      { text: " =", classes: [], changed: true },
      { text: " 1", classes: [], changed: false },
    ]);
  });

  it("leaves pieces alone without ranges", () => {
    const pieces: Piece[] = [{ text: "a", classes: [] }];
    expect(markChanged(pieces, [])).toBe(pieces);
  });
});

describe("highlightHunks", () => {
  it("highlights each side of a hunk once and indexes the lines by number", () => {
    const highlight = vi.fn((code: string): Piece[] => [{ text: code.toUpperCase(), classes: ["x"] }]);
    const result = highlightHunks(
      [
        {
          rows: [
            { kind: "context", oldNo: 1, newNo: 1, text: "b", oldText: "a" },
            { kind: "remove", oldNo: 2, text: "c" },
            { kind: "add", newNo: 2, text: "d" },
          ],
        },
      ],
      highlight,
    );
    expect(highlight).toHaveBeenCalledTimes(2);
    expect(result.old.get(1)).toEqual([{ text: "A", classes: ["x"] }]);
    expect(result.old.get(2)).toEqual([{ text: "C", classes: ["x"] }]);
    expect(result.new.get(1)).toEqual([{ text: "B", classes: ["x"] }]);
    expect(result.new.get(2)).toEqual([{ text: "D", classes: ["x"] }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/tools/developer/diff/language.test.ts lib/tools/developer/diff/highlight.test.ts`
Expected: FAIL — `Failed to resolve import "./language"` / `"./highlight"`.

- [ ] **Step 3: Write the implementation**

`lib/tools/developer/diff/language.ts`:

```ts
/** Languages the diff tools can color, by highlight.js id. */
export const LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "json", label: "JSON" },
  { id: "css", label: "CSS" },
  { id: "xml", label: "HTML / XML" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
  { id: "sql", label: "SQL" },
  { id: "yaml", label: "YAML" },
  { id: "bash", label: "Bash" },
  { id: "markdown", label: "Markdown" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

const BY_EXTENSION: Record<string, LanguageId> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  json: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  vue: "xml",
  py: "python",
  go: "go",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  md: "markdown",
  markdown: "markdown",
};

const BY_NAME: Record<string, LanguageId> = {
  ".bashrc": "bash",
  ".zshrc": "bash",
  ".bash_profile": "bash",
  ".profile": "bash",
};

/** The language to color a file in, from its name. Null means plain text. */
export function languageForFile(path: string): LanguageId | null {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  const dot = name.lastIndexOf(".");
  // No extension, or a dotfile like ".env" whose whole name is the "extension".
  if (dot <= 0) return null;
  return BY_EXTENSION[name.slice(dot + 1)] ?? null;
}
```

`lib/tools/developer/diff/highlight.ts`:

```ts
import type { Hunk, WordRange } from "./model";

/** A run of text with its highlight.js classes. `changed` marks a changed word inside a changed line. */
export interface Piece {
  text: string;
  classes: string[];
  changed?: boolean;
}

/** Turns code into pieces; the diff tools pass highlight.js through parseHighlighted. */
export type Highlight = (code: string) => Piece[];

/** Highlighted pieces for each line, by line number, on each side. */
export interface SideHighlights {
  old: Map<number, Piece[]>;
  new: Map<number, Piece[]>;
}

/** Above this many lines the diff tools skip syntax colors: highlighting would slow typing down. */
export const HIGHLIGHT_LINE_LIMIT = 5000;

export function plainPieces(text: string): Piece[] {
  return text ? [{ text, classes: [] }] : [];
}

/** Splits pieces where changed-word ranges start and end, and flags the pieces inside a range. */
export function markChanged(pieces: Piece[], ranges: WordRange[]): Piece[] {
  if (ranges.length === 0) return pieces;
  const cuts = [...new Set(ranges.flatMap((r) => [r.start, r.end]))].sort((a, b) => a - b);
  const inRange = (at: number) => ranges.some((r) => at >= r.start && at < r.end);

  const out: Piece[] = [];
  let pos = 0;
  for (const piece of pieces) {
    const end = pos + piece.text.length;
    const points = [...cuts.filter((c) => c > pos && c < end), end];
    let from = pos;
    for (const to of points) {
      out.push({ ...piece, text: piece.text.slice(from - pos, to - pos), changed: inRange(from) });
      from = to;
    }
    pos = end;
  }
  return out;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'" };
const TOKEN = /<span class="([^"]*)">|<\/span>|&(?:amp|lt|gt|quot|#x27);|[^<&]+|[<&]/g;

/**
 * Reads highlight.js output into pieces, so it renders as React text instead of injected HTML. highlight.js only
 * writes class spans and five escapes; anything else means the input isn't its output, so this throws.
 */
export function parseHighlighted(html: string): Piece[] {
  const out: Piece[] = [];
  const open: string[][] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ text, classes: open.flat() });
    text = "";
  };

  for (const match of html.matchAll(TOKEN)) {
    const token = match[0];
    if (match[1] !== undefined) {
      flush();
      open.push(match[1].split(" ").filter(Boolean));
    } else if (token === "</span>") {
      flush();
      if (!open.pop()) throw new Error("Unbalanced </span> in highlighted code.");
    } else if (token in ENTITIES) {
      text += ENTITIES[token];
    } else if (token === "<" || token === "&") {
      throw new Error(`Unexpected markup at ${match.index} in highlighted code.`);
    } else {
      text += token;
    }
  }
  flush();
  return out;
}

/** Splits pieces into lines. A piece spanning lines (a block comment) keeps its classes on every line. */
export function piecesByLine(pieces: Piece[]): Piece[][] {
  const lines: Piece[][] = [[]];
  for (const piece of pieces) {
    piece.text.split("\n").forEach((text, i) => {
      if (i > 0) lines.push([]);
      if (text) lines[lines.length - 1].push({ ...piece, text });
    });
  }
  return lines;
}

/**
 * Highlights each hunk's old side and new side as whole blocks (so multi-line comments and strings color
 * correctly), then indexes the pieces by line number.
 */
export function highlightHunks(hunks: Hunk[], highlight: Highlight): SideHighlights {
  const result: SideHighlights = { old: new Map(), new: new Map() };
  for (const hunk of hunks) {
    for (const side of ["old", "new"] as const) {
      const lines = hunk.rows.flatMap((row) => {
        const no = side === "old" ? row.oldNo : row.newNo;
        if (no === undefined) return [];
        return [{ no, text: side === "old" ? (row.oldText ?? row.text) : row.text }];
      });
      if (lines.length === 0) continue;
      const byLine = piecesByLine(highlight(lines.map((line) => line.text).join("\n")));
      lines.forEach((line, i) => result[side].set(line.no, byLine[i] ?? []));
    }
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/tools/developer/diff/language.test.ts lib/tools/developer/diff/highlight.test.ts`
Expected: PASS — 28 tests (18 language, 10 highlight).

- [ ] **Step 5: Commit**

```bash
git add lib/tools/developer/diff/language.ts lib/tools/developer/diff/language.test.ts lib/tools/developer/diff/highlight.ts lib/tools/developer/diff/highlight.test.ts
git commit -m "feat(diff): languages by file name and highlight pieces"
```

---

### Task 6: Shared UI — tokens, panels, FileDrop, DiffStats, DiffView, highlighter hook

No component tests exist in this repo; the gate is `tsc` + lint here and the live checks in Task 10.

**Files:**
- Modify: `app/globals.css`, `components/tool-shell/ToolPanels.tsx`, `components/ui/FileDrop.tsx`
- Create: `lib/hooks/useMediaQuery.ts`, `components/tools/developer/diff/DiffStats.tsx`, `components/tools/developer/diff/DiffView.tsx`, `components/tools/developer/diff/useHighlighters.ts`

**Interfaces:**
- Consumes: `Hunk`, `Row`, `Stats` (model.ts); `collapseRows`, `DEFAULT_CONTEXT` (hunks.ts); `toSplitLines` (split.ts); `markChanged`, `plainPieces`, `parseHighlighted`, `Piece`, `Highlight`, `SideHighlights` (highlight.ts); `LanguageId` (language.ts).
- Produces:
  - `InputPanel` / `OutputPanel` prop `wide?: boolean`
  - `FileDrop` prop `compact?: boolean`
  - `useMediaQuery(query: string, serverValue?: boolean): boolean`
  - `DiffStats` default export, props `{ stats: Stats; files?: number }`
  - `DiffView` default export, props `{ hunks: Hunk[]; layout: DiffLayout; context: number | "all" | "none"; highlights?: SideHighlights | null }`; named exports `type DiffLayout = "split" | "unified"`, `SPLIT_QUERY = "(min-width: 640px)"`, `ROW_LIMIT = 2000`
  - `useHighlighters(languages: readonly LanguageId[]): (language: LanguageId | null) => Highlight | null`

- [ ] **Step 1: Add diff and syntax color tokens**

In `app/globals.css`, in the `:root` block replace

```css
  --border: color-mix(in srgb, var(--text-secondary) 38%, transparent);
  color-scheme: dark;
```

with

```css
  --border: color-mix(in srgb, var(--text-secondary) 38%, transparent);
  /* Diff rows and changed words. */
  --diff-add-bg: color-mix(in srgb, #3F9A80 18%, transparent);
  --diff-add-word: color-mix(in srgb, #3F9A80 45%, transparent);
  --diff-remove-bg: color-mix(in srgb, var(--error) 16%, transparent);
  --diff-remove-word: color-mix(in srgb, var(--error) 42%, transparent);
  --diff-add-text: #6FC2A6;
  --diff-remove-text: #F08A80;
  --diff-empty: color-mix(in srgb, var(--text-secondary) 10%, transparent);
  /* Syntax colors for highlighted code. */
  --syntax-keyword: #C39BD3;
  --syntax-string: #9CCB8F;
  --syntax-number: #E0B36A;
  --syntax-comment: #7A8594;
  --syntax-title: #7FB3E0;
  --syntax-attr: #E0B36A;
  --syntax-type: #7FC8C8;
  --syntax-meta: #8C95A3;
  --syntax-variable: #E88C8C;
  --syntax-tag: #7FB3E0;
  color-scheme: dark;
```

and in the `:root[data-theme="light"]` block replace

```css
  --border: color-mix(in srgb, var(--text-secondary) 28%, transparent);
  color-scheme: light;
```

with

```css
  --border: color-mix(in srgb, var(--text-secondary) 28%, transparent);
  --diff-add-bg: color-mix(in srgb, #3F9A80 14%, transparent);
  --diff-add-word: color-mix(in srgb, #3F9A80 34%, transparent);
  --diff-remove-bg: color-mix(in srgb, var(--error) 12%, transparent);
  --diff-remove-word: color-mix(in srgb, var(--error) 30%, transparent);
  --diff-add-text: #1E7259;
  --diff-remove-text: #B3261E;
  --diff-empty: color-mix(in srgb, var(--text-secondary) 8%, transparent);
  --syntax-keyword: #7A3E9D;
  --syntax-string: #2E7D32;
  --syntax-number: #9A6200;
  --syntax-comment: #6A737D;
  --syntax-title: #1F5FAD;
  --syntax-attr: #9A6200;
  --syntax-type: #00727A;
  --syntax-meta: #5B6472;
  --syntax-variable: #B3261E;
  --syntax-tag: #1F5FAD;
  color-scheme: light;
```

and append at the end of the file:

```css
/* highlight.js classes, as rendered by the diff tools (no highlight.js theme is loaded). */
.hljs-keyword, .hljs-selector-tag, .hljs-doctag { color: var(--syntax-keyword); }
.hljs-string, .hljs-regexp { color: var(--syntax-string); }
.hljs-number, .hljs-literal, .hljs-symbol { color: var(--syntax-number); }
.hljs-comment, .hljs-quote { color: var(--syntax-comment); font-style: italic; }
.hljs-title, .hljs-section, .hljs-selector-id, .hljs-selector-class { color: var(--syntax-title); }
.hljs-attr, .hljs-attribute, .hljs-property { color: var(--syntax-attr); }
.hljs-built_in, .hljs-type { color: var(--syntax-type); }
.hljs-meta, .hljs-bullet { color: var(--syntax-meta); }
.hljs-variable, .hljs-template-variable { color: var(--syntax-variable); }
.hljs-tag, .hljs-name { color: var(--syntax-tag); }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 600; }
```

- [ ] **Step 2: Add `wide` to the tool panels**

In `components/tool-shell/ToolPanels.tsx`:

```tsx
interface InputPanelProps {
  label?: string;
  /** Span every column of the tool layout, for tools whose input needs the full width. */
  wide?: boolean;
  children: ReactNode;
}

export function InputPanel({ label = "Input", wide = false, children }: InputPanelProps) {
  return (
    <section className={`${panelClass} ${wide ? "lg:col-span-full" : ""}`} aria-label={label} data-tool-input>
```

and in `OutputPanelProps` add

```tsx
  /** Span every column of the tool layout, for wide output like a diff. */
  wide?: boolean;
```

with the component signature and section becoming

```tsx
export function OutputPanel({ label = "Output", copyText, outputType, download, wide = false, children }: OutputPanelProps) {
  return (
    <section className={`${panelClass} ${wide ? "lg:col-span-full" : ""} font-[family-name:var(--font-output)]`} aria-label={label}>
```

- [ ] **Step 3: Add `compact` to FileDrop**

In `components/ui/FileDrop.tsx` add to `FileDropProps`:

```tsx
  /** One slim row instead of a tall zone, for sitting under a text field. */
  compact?: boolean;
```

Destructure `compact = false` in the signature. Replace the zone's class expression

```tsx
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-sm ${
```

with

```tsx
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-center text-sm ${
        compact ? "px-3 py-2" : "flex-col p-8"
      } ${
```

the icon with

```tsx
      <Upload aria-hidden className={`${compact ? "h-4 w-4" : "h-6 w-6"} text-[color:var(--text-muted)]`} />
```

and wrap the privacy line so compact mode drops it (the zone's `title` keeps the message):

```tsx
      {!compact && <p className="text-xs text-[color:var(--text-muted)]">Processed in your browser. Nothing is uploaded.</p>}
```

Also add `title={compact ? "Processed in your browser. Nothing is uploaded." : undefined}` to the zone's outer `<div>`.

- [ ] **Step 4: Create `useMediaQuery`**

`lib/hooks/useMediaQuery.ts`:

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept up to date. `serverValue` is used on the server and while hydrating. */
export function useMediaQuery(query: string, serverValue = true): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
```

- [ ] **Step 5: Create `DiffStats`**

`components/tools/developer/diff/DiffStats.tsx`:

```tsx
import type { Stats } from "@/lib/tools/developer/diff/model";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "+12 −4 · 30 unchanged", or with `files` "3 files changed +12 −4". Shared by both diff tools. */
export default function DiffStats({ stats, files }: { stats: Stats; files?: number }) {
  const spoken = [
    files !== undefined ? `${plural(files, "file")} changed` : null,
    `${plural(stats.added, "line")} added`,
    `${stats.removed} removed`,
    files === undefined ? `${stats.unchanged} unchanged` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
      <span className="sr-only">{spoken}</span>
      {files !== undefined && <span aria-hidden>{plural(files, "file")} changed</span>}
      <span aria-hidden className="font-[family-name:var(--font-mono)] text-[color:var(--diff-add-text)]">
        +{stats.added}
      </span>
      <span aria-hidden className="font-[family-name:var(--font-mono)] text-[color:var(--diff-remove-text)]">
        −{stats.removed}
      </span>
      {files === undefined && (
        <span aria-hidden className="text-[color:var(--text-muted)]">
          · {stats.unchanged} unchanged
        </span>
      )}
    </p>
  );
}
```

- [ ] **Step 6: Create `DiffView`**

`components/tools/developer/diff/DiffView.tsx`:

```tsx
"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { collapseRows } from "@/lib/tools/developer/diff/hunks";
import { markChanged, plainPieces, type SideHighlights } from "@/lib/tools/developer/diff/highlight";
import type { Hunk, Row } from "@/lib/tools/developer/diff/model";
import { toSplitLines } from "@/lib/tools/developer/diff/split";

export type DiffLayout = "split" | "unified";

/** Split view needs two readable columns; narrower screens get unified. */
export const SPLIT_QUERY = "(min-width: 640px)";

/** Rows drawn before a "Show all" button, so a huge diff can't freeze the page. */
export const ROW_LIMIT = 2000;

type Side = "old" | "new";

interface DiffViewProps {
  hunks: Hunk[];
  layout: DiffLayout;
  /** Unchanged lines kept around each change; "all" shows every row; "none" shows hunks as given (a pasted diff). */
  context: number | "all" | "none";
  highlights?: SideHighlights | null;
}

type Item =
  | { type: "header"; key: string; text: string }
  | { type: "skipped"; key: string; from: number; to: number }
  | { type: "gap"; key: string; count: number }
  | { type: "rows"; key: string; rows: Row[] };

const rowTint: Record<Row["kind"], string> = {
  add: "bg-[color:var(--diff-add-bg)]",
  remove: "bg-[color:var(--diff-remove-bg)]",
  context: "",
  ignored: "text-[color:var(--text-muted)]",
};
const markers: Record<Row["kind"], string> = { add: "+", remove: "−", context: "", ignored: "" };
const spoken: Record<Row["kind"], string> = { add: "Added line: ", remove: "Removed line: ", context: "", ignored: "Ignored line: " };
const wordTint: Partial<Record<Row["kind"], string>> = {
  add: "rounded-sm bg-[color:var(--diff-add-word)]",
  remove: "rounded-sm bg-[color:var(--diff-remove-word)]",
};

const gutterClass = "w-[1%] select-none whitespace-nowrap px-2 text-right align-top text-[color:var(--text-muted)]";
const markerClass = "w-[1%] select-none pl-1 align-top";
const codeClass = "whitespace-pre-wrap px-2 align-top [overflow-wrap:anywhere]";

/** Draws one file's hunks, split or unified. Knows nothing about where the diff came from. */
export default function DiffView({ hunks, layout, context, highlights }: DiffViewProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const items: Item[] = [];
  hunks.forEach((hunk, h) => {
    if (hunk.skippedBefore) items.push({ type: "skipped", key: `${h}:skipped`, ...hunk.skippedBefore });
    if (hunk.header) items.push({ type: "header", key: `${h}:header`, text: hunk.header });
    const blocks = context === "none" ? [{ kind: "rows" as const, start: 0, rows: hunk.rows }] : collapseRows(hunk.rows, context);
    for (const block of blocks) {
      const key = `${h}:${block.start}`;
      if (block.kind === "rows") items.push({ type: "rows", key, rows: block.rows });
      else if (expanded.has(key)) items.push({ type: "rows", key, rows: hunk.rows.slice(block.start, block.end) });
      else items.push({ type: "gap", key, count: block.end - block.start });
    }
  });

  const total = items.reduce((n, item) => n + (item.type === "rows" ? item.rows.length : 0), 0);
  let budget = showAll ? Infinity : ROW_LIMIT;
  const shown: Item[] = [];
  for (const item of items) {
    if (budget <= 0) break;
    if (item.type === "rows") {
      shown.push({ ...item, rows: item.rows.slice(0, budget) });
      budget -= item.rows.length;
    } else {
      shown.push(item);
    }
  }

  const columns = layout === "split" ? 6 : 4;
  const expand = (key: string) => setExpanded((prev) => new Set(prev).add(key));

  return (
    <div className="space-y-3">
      <table className="w-full border-collapse font-[family-name:var(--font-mono)] text-xs leading-5">
        <tbody>
          {shown.map((item) => {
            if (item.type === "header" || item.type === "skipped") {
              return (
                <tr key={item.key}>
                  <td colSpan={columns} className="bg-[color:var(--diff-empty)] px-2 py-1 text-[color:var(--text-muted)]">
                    {item.type === "header" ? item.text : `⋯ Lines ${item.from}–${item.to} aren't in this diff`}
                  </td>
                </tr>
              );
            }
            if (item.type === "gap") {
              return (
                <tr key={item.key}>
                  <td colSpan={columns} className="p-0">
                    <button
                      type="button"
                      onClick={() => expand(item.key)}
                      className="w-full bg-[color:var(--diff-empty)] px-2 py-1 text-left font-[family-name:var(--font-ui)] text-[color:var(--accent-text)] hover:underline"
                    >
                      ⋯ Show {item.count} unchanged {item.count === 1 ? "line" : "lines"}
                    </button>
                  </td>
                </tr>
              );
            }
            return layout === "split" ? (
              toSplitLines(item.rows).map((line, i) => (
                <tr key={`${item.key}:${i}`}>
                  <SplitHalf row={line.left} side="old" highlights={highlights} />
                  <SplitHalf row={line.right} side="new" highlights={highlights} />
                </tr>
              ))
            ) : (
              item.rows.map((row, i) => (
                <tr key={`${item.key}:${i}`} className={rowTint[row.kind]}>
                  <td className={gutterClass}>{row.oldNo}</td>
                  <td className={gutterClass}>{row.newNo}</td>
                  <td aria-hidden className={`${markerClass} ${markerColor(row)}`}>
                    {markers[row.kind]}
                  </td>
                  <td className={codeClass}>
                    <Code row={row} side={row.kind === "remove" || (row.kind === "ignored" && row.oldNo !== undefined) ? "old" : "new"} highlights={highlights} />
                  </td>
                </tr>
              ))
            );
          })}
        </tbody>
      </table>
      {total > ROW_LIMIT && !showAll && (
        <Button size="sm" onClick={() => setShowAll(true)}>
          Show all {total} rows
        </Button>
      )}
    </div>
  );
}

function markerColor(row: Row): string {
  if (row.kind === "add") return "text-[color:var(--diff-add-text)]";
  if (row.kind === "remove") return "text-[color:var(--diff-remove-text)]";
  return "";
}

/** One side of a split-view line; an empty side is shaded. */
function SplitHalf({ row, side, highlights }: { row?: Row; side: Side; highlights?: SideHighlights | null }) {
  if (!row) return <td colSpan={3} className="bg-[color:var(--diff-empty)]" />;
  const tint = row.kind === "context" ? "" : rowTint[row.kind];
  return (
    <>
      <td className={`${gutterClass} ${tint}`}>{side === "old" ? row.oldNo : row.newNo}</td>
      <td aria-hidden className={`${markerClass} ${tint} ${markerColor(row)}`}>
        {markers[row.kind]}
      </td>
      <td className={`${codeClass} w-1/2 ${tint}`}>
        <Code row={row} side={side} highlights={highlights} />
      </td>
    </>
  );
}

/** A row's text on one side: syntax pieces when highlighted, with changed words marked. */
function Code({ row, side, highlights }: { row: Row; side: Side; highlights?: SideHighlights | null }) {
  const text = side === "old" ? (row.oldText ?? row.text) : row.text;
  const no = side === "old" ? row.oldNo : row.newNo;
  const base = (no !== undefined ? highlights?.[side].get(no) : undefined) ?? plainPieces(text);
  const pieces = markChanged(base, row.words ?? []);
  return (
    <>
      {spoken[row.kind] && <span className="sr-only">{spoken[row.kind]}</span>}
      {pieces.map((piece, i) => (
        <span key={i} className={`${piece.classes.join(" ")} ${piece.changed ? (wordTint[row.kind] ?? "") : ""}`}>
          {piece.text}
        </span>
      ))}
    </>
  );
}
```

- [ ] **Step 7: Create `useHighlighters`**

`components/tools/developer/diff/useHighlighters.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { LanguageFn } from "highlight.js";
import { parseHighlighted, plainPieces, type Highlight } from "@/lib/tools/developer/diff/highlight";
import type { LanguageId } from "@/lib/tools/developer/diff/language";

const LOADERS: Record<LanguageId, () => Promise<{ default: LanguageFn }>> = {
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  json: () => import("highlight.js/lib/languages/json"),
  css: () => import("highlight.js/lib/languages/css"),
  xml: () => import("highlight.js/lib/languages/xml"),
  python: () => import("highlight.js/lib/languages/python"),
  go: () => import("highlight.js/lib/languages/go"),
  sql: () => import("highlight.js/lib/languages/sql"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  bash: () => import("highlight.js/lib/languages/bash"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
};

async function load(languages: LanguageId[]): Promise<[LanguageId, Highlight][]> {
  const hljs = (await import("highlight.js/lib/core")).default;
  const modules = await Promise.all(languages.map((language) => LOADERS[language]()));
  return languages.map((language, i) => {
    if (!hljs.getLanguage(language)) hljs.registerLanguage(language, modules[i].default);
    const highlight: Highlight = (code) => {
      try {
        return parseHighlighted(hljs.highlight(code, { language, ignoreIllegals: true }).value);
      } catch {
        return plainPieces(code);
      }
    };
    return [language, highlight];
  });
}

/**
 * Loads highlight.js and the given languages on demand (nothing loads for plain text). Returns a lookup that
 * gives null until a language is ready, so rows render plain first and gain colors without shifting.
 */
export function useHighlighters(languages: readonly LanguageId[]): (language: LanguageId | null) => Highlight | null {
  const [ready, setReady] = useState<ReadonlyMap<LanguageId, Highlight>>(new Map());
  const wanted = [...new Set(languages)].sort().join(",");

  useEffect(() => {
    const missing = (wanted ? wanted.split(",") : []).filter((l) => !ready.has(l as LanguageId)) as LanguageId[];
    if (missing.length === 0) return;
    let cancelled = false;
    load(missing)
      .then((loaded) => !cancelled && setReady((prev) => new Map([...prev, ...loaded])))
      // A failed chunk load leaves the diff uncolored, which is still correct.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // `ready` is read, not watched: watching it would re-run after every load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  return useCallback((language) => (language ? (ready.get(language) ?? null) : null), [ready]);
}
```

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit && npx next lint --dir components lib app && echo clean`
Expected: `clean`. (If `import type { LanguageFn } from "highlight.js"` fails, the type is declared in `node_modules/highlight.js/types/index.d.ts`; use the name exported there and ledger it.)

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS — all existing tests plus Tasks 1–5's.

- [ ] **Step 10: Commit**

```bash
git add app/globals.css components/tool-shell/ToolPanels.tsx components/ui/FileDrop.tsx lib/hooks/useMediaQuery.ts components/tools/developer/diff
git commit -m "feat(diff): shared diff renderer, stats, highlighter hook and tokens"
```

---

### Task 7: Git diff parsing, sample and paste detection

**Files:**
- Create: `lib/tools/developer/diff/git-parse.ts`, `lib/tools/developer/diff/git-sample.ts`
- Modify: `components/workbench/detectors.ts`, `registry/data-types.ts`
- Test: `lib/tools/developer/diff/git-parse.test.ts`, `components/workbench/detectors.test.ts`

**Interfaces:**
- Consumes: `DiffFile`, `FileStatus`, `Hunk`, `Row`, `statsOf` (model.ts); `pairChanges` (words.ts).
- Produces:
  - `MAX_GIT_DIFF_BYTES = 5 * 1024 * 1024`
  - `type GitParseResult = { ok: true; files: DiffFile[] } | { ok: false; reason: "empty" | "combined" | "too-large" }`
  - `parseGitDiff(text: string): GitParseResult`
  - `filePath(file: DiffFile): string` — `"old → new"` for renames/copies, old name for deletions, else new name
  - `languagePath(file: DiffFile): string` — old name for deletions, else new name
  - `GIT_DIFF_SAMPLE: string`
  - `DataType` gains `"diff"` (label `"diff"`); `PasteType` gains `"diff"`

- [ ] **Step 1: Write the sample**

`lib/tools/developer/diff/git-sample.ts` (an array joined with `\n`, so editors can't strip the context line that is a single space):

```ts
/** Pre-filled in the Git Diff Viewer: a two-hunk change, a rename and a new binary file. */
export const GIT_DIFF_SAMPLE = [
  "diff --git a/src/greet.ts b/src/greet.ts",
  "index 3b18e51..a1c2d3f 100644",
  "--- a/src/greet.ts",
  "+++ b/src/greet.ts",
  "@@ -1,6 +1,6 @@",
  " export function greet(name: string) {",
  '-  return "Hello " + name;',
  "+  return `Hello ${name}`;",
  " }",
  " ",
  " export function shout(name: string) {",
  "   return greet(name).toUpperCase();",
  "@@ -20,4 +20,7 @@ export function farewell(name: string) {",
  '   return "Bye " + name;',
  " }",
  " ",
  "-export const VERSION = 1;",
  "+export const VERSION = 2;",
  "+",
  "+/** Greets everyone in the list. */",
  "+export const greetAll = (names: string[]) => names.map(greet);",
  "diff --git a/lib/old-utils.ts b/lib/utils.ts",
  "similarity index 92%",
  "rename from lib/old-utils.ts",
  "rename to lib/utils.ts",
  "index 1111111..2222222 100644",
  "--- a/lib/old-utils.ts",
  "+++ b/lib/utils.ts",
  "@@ -1,3 +1,3 @@",
  " export function clamp(n: number, min: number, max: number) {",
  "-  return Math.min(Math.max(n, min), max);",
  "+  return Math.max(min, Math.min(n, max));",
  " }",
  "diff --git a/public/logo.png b/public/logo.png",
  "new file mode 100644",
  "index 0000000..8f3c2a1",
  "Binary files /dev/null and b/public/logo.png differ",
  "",
].join("\n");
```

- [ ] **Step 2: Write the failing tests**

`lib/tools/developer/diff/git-parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filePath, MAX_GIT_DIFF_BYTES, parseGitDiff } from "./git-parse";
import { GIT_DIFF_SAMPLE } from "./git-sample";
import type { DiffFile, Row } from "./model";

function files(text: string): DiffFile[] {
  const result = parseGitDiff(text);
  if (!result.ok) throw new Error(`not parsed: ${result.reason}`);
  return result.files;
}

const summary = (list: DiffFile[]) => list.map((f) => [filePath(f), f.status, f.binary, f.stats.added, f.stats.removed]);
const brief = (rows: Row[]) => rows.map((r) => `${r.kind[0]} ${r.oldNo ?? "-"} ${r.newNo ?? "-"} ${r.text}`);

const SAMPLE_SUMMARY = [
  ["src/greet.ts", "modified", false, 5, 2],
  ["lib/old-utils.ts → lib/utils.ts", "renamed", false, 1, 1],
  ["public/logo.png", "added", true, 0, 0],
];

describe("parseGitDiff", () => {
  it("reads a modified file, a rename and a new binary file", () => {
    expect(summary(files(GIT_DIFF_SAMPLE))).toEqual(SAMPLE_SUMMARY);
  });

  it("reads Windows line endings like Unix ones", () => {
    expect(summary(files(GIT_DIFF_SAMPLE.replace(/\n/g, "\r\n")))).toEqual(SAMPLE_SUMMARY);
  });

  it("keeps real line numbers and strips the diff markers", () => {
    const [greet] = files(GIT_DIFF_SAMPLE);
    expect(greet.hunks[0].header).toBe("@@ -1,6 +1,6 @@");
    expect(brief(greet.hunks[0].rows)).toEqual([
      "c 1 1 export function greet(name: string) {",
      'r 2 -   return "Hello " + name;',
      "a - 2   return `Hello ${name}`;",
      "c 3 3 }",
      "c 4 4 ",
      "c 5 5 export function shout(name: string) {",
      "c 6 6   return greet(name).toUpperCase();",
    ]);
  });

  it("notes the old-side lines between hunks", () => {
    const [greet] = files(GIT_DIFF_SAMPLE);
    expect(greet.hunks.map((h) => h.skippedBefore)).toEqual([undefined, { from: 7, to: 19 }]);
  });

  it("pairs changed lines for word marks", () => {
    const [greet] = files(GIT_DIFF_SAMPLE);
    expect(greet.hunks[0].rows[1].words).toBeDefined();
    expect(greet.hunks[0].rows[2].words).toBeDefined();
  });

  it("reads a mode-only change and a deleted file", () => {
    const text = [
      "diff --git a/run.sh b/run.sh",
      "old mode 100644",
      "new mode 100755",
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "index abc1234..0000000",
      "--- a/old.txt",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-x",
      "-y",
      "\\ No newline at end of file",
      "",
    ].join("\n");
    const list = files(text);
    expect(summary(list)).toEqual([
      ["run.sh", "mode", false, 0, 0],
      ["old.txt", "deleted", false, 0, 2],
    ]);
    expect(list[1].hunks[0].rows).toHaveLength(2);
  });

  it("skips the commit header of git show output", () => {
    const text = [
      "commit 0123456789abcdef0123456789abcdef01234567",
      "Author: Ada <ada@example.com>",
      "Date:   Mon Oct 4 10:00:00 2026 +0000",
      "",
      "    Fix the greeting",
      "",
      "diff --git a/a.ts b/a.ts",
      "index 1111111..2222222 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "",
    ].join("\n");
    expect(summary(files(text))).toEqual([["a.ts", "modified", false, 1, 1]]);
  });

  it("keeps spaces in file paths", () => {
    const text = [
      "diff --git a/my notes.md b/my notes.md",
      "index 1111111..2222222 100644",
      "--- a/my notes.md",
      "+++ b/my notes.md",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "",
    ].join("\n");
    expect(files(text).map(filePath)).toEqual(["my notes.md"]);
  });

  it("refuses combined merge diffs", () => {
    expect(parseGitDiff("diff --cc file.txt\nindex 1111111,2222222..3333333\n")).toEqual({ ok: false, reason: "combined" });
  });

  it("finds nothing in plain text", () => {
    expect(parseGitDiff("hello world\nnot a diff")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses input over 5 MB", () => {
    expect(parseGitDiff("a".repeat(MAX_GIT_DIFF_BYTES + 1))).toEqual({ ok: false, reason: "too-large" });
  });
});
```

Append to the `it.each` table in `components/workbench/detectors.test.ts` (before `["   ", "text"]`):

```ts
    ["diff --git a/x.ts b/x.ts\nindex 1..2 100644\n", "diff"],
    ["commit 0123456789abcdef0123456789abcdef01234567\nAuthor: A\n\ndiff --git a/x b/x\n", "diff"],
    ["--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b", "diff"],
    ["---\ntitle: front matter\n---", "text"],
    ["commit 0123456 has no diff", "text"],
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/tools/developer/diff/git-parse.test.ts components/workbench/detectors.test.ts`
Expected: FAIL — `Failed to resolve import "./git-parse"`, and the three diff rows of `detectType` return `"text"`.

- [ ] **Step 4: Write the implementation**

`lib/tools/developer/diff/git-parse.ts`:

```ts
import { parse } from "diff2html/lib/diff-parser";
import { LineType, type DiffBlock, type DiffFile as ParsedFile, type DiffLine } from "diff2html/lib/types";
import { statsOf, type DiffFile, type FileStatus, type Hunk, type Row } from "./model";
import { pairChanges } from "./words";

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
```

> Note: lines before the *first* hunk are deliberately not reported (the spec's gap rows sit *between* hunks), hence the `previous` condition.

In `components/workbench/detectors.ts` change the `PasteType` line to

```ts
export type PasteType = Extract<DataType, "curl" | "jwt" | "json" | "cron" | "diff" | "text">;
```

add above `detectType`:

```ts
const GIT_COMMIT_HEADER = /^(?:commit|From) [0-9a-f]{7,40}\b/;
const UNIFIED_HUNK = /^--- .*\r?\n\+\+\+ .*\r?\n@@ /m;

/** `git diff` / `git show` / `git format-patch` output, or any unified diff. */
function isDiff(text: string): boolean {
  if (text.startsWith("diff --git ")) return true;
  if (GIT_COMMIT_HEADER.test(text) && /^diff --git /m.test(text)) return true;
  return UNIFIED_HUNK.test(text);
}
```

and in `detectType`, directly after the cURL check:

```ts
  if (isDiff(text)) return "diff";
```

In `registry/data-types.ts` add `"diff",` after `"git",` in `DATA_TYPES` and `diff: "diff",` after `git: "Git command",` in `dataTypeLabels`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/tools/developer/diff/git-parse.test.ts components/workbench/detectors.test.ts`
Expected: PASS — 11 git-parse tests and every detector row. If diff2html's types make `file.oldMode` a `string | string[]` or the `isCopy`/`isBinary` names differ, read `node_modules/diff2html/lib/types.d.ts` and adapt `statusOf`; the tests pin the behaviour.

- [ ] **Step 6: Type-check, then commit**

Run: `npx tsc --noEmit && echo clean`
Expected: `clean`. Any `Record<DataType, …>` or `Record<PasteType, …>` elsewhere that now misses `diff` shows here; add a `diff` entry matching its neighbours.

```bash
git add lib/tools/developer/diff/git-parse.ts lib/tools/developer/diff/git-parse.test.ts lib/tools/developer/diff/git-sample.ts components/workbench/detectors.ts components/workbench/detectors.test.ts registry/data-types.ts
git commit -m "feat(diff): parse pasted git diffs and detect pasted diffs"
```

---

### Task 8: Text Diff Checker

**Files:**
- Create: `components/tools/developer/TextDiffChecker.tsx`, `registry/tools/developer/text-diff-checker.ts`
- Modify: `registry/tools/developer/index.ts`, `components/catalog/icons.tsx`, `registry/registry.test.ts`

**Interfaces:**
- Consumes: `computeDiff`, `NO_OPTIONS`, `CompareOptions` (compare.ts); `DEFAULT_CONTEXT` (hunks.ts); `generatePatch`, `patchFileName` (patch.ts); `highlightHunks`, `HIGHLIGHT_LINE_LIMIT` (highlight.ts); `LANGUAGES`, `languageForFile`, `LanguageId` (language.ts); `readTextFile` (text-file.ts); `DiffFile` (model.ts); `DiffView`, `SPLIT_QUERY`, `DiffStats`, `useHighlighters` (Task 6); `useMediaQuery`; `useToolInput`; panels with `wide`; `FileDrop compact`.
- Produces: tool `text-diff-checker` at `/tools/developer/text-diff-checker`, `produces: ["diff"]`.

- [ ] **Step 1: Write the failing registry test**

In `registry/registry.test.ts`, change the url-encoder expectation to

```ts
    expect(ids(sendTargets(getToolById("url-encoder")!, "text"))).toEqual(["hash-generator", "regex-tester", "text-diff-checker"]);
```

(Task 9 adds `git-diff-viewer` to this list.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run registry/registry.test.ts`
Expected: FAIL — received `["hash-generator", "regex-tester"]`.

- [ ] **Step 3: Add the registry entry and icon**

`registry/tools/developer/text-diff-checker.ts`:

```ts
import type { ToolConfig } from "@/registry/types";

const textDiffChecker: ToolConfig = {
  id: "text-diff-checker",
  category: "developer",
  title: "Text Diff Checker",
  description: "Compare two texts or files and see every changed line and word, side by side or as a patch.",
  keywords: [
    "diff checker",
    "text diff",
    "compare text",
    "compare two files",
    "text compare",
    "find differences",
    "compare code",
    "diff online",
    "create patch",
  ],
  actions: ["compare"],
  component: () => import("@/components/tools/developer/TextDiffChecker"),
  consumes: ["text", "code"],
  produces: ["diff"],
};

export default textDiffChecker;
```

In `registry/tools/developer/index.ts` add `import textDiffChecker from "./text-diff-checker";` (alphabetical, after `sqlToMongo`) and append `textDiffChecker` to the `developerTools` array.

In `components/catalog/icons.tsx` add `Diff,` to the lucide import (alphabetical, after `Database`) and `"text-diff-checker": Diff,` after `"git-command-builder": GitBranch,`.

- [ ] **Step 4: Write the component**

`components/tools/developer/TextDiffChecker.tsx`:

```tsx
"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import CodeBlock from "@/components/ui/CodeBlock";
import { CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { computeDiff, NO_OPTIONS, type CompareOptions } from "@/lib/tools/developer/diff/compare";
import { highlightHunks, HIGHLIGHT_LINE_LIMIT } from "@/lib/tools/developer/diff/highlight";
import { DEFAULT_CONTEXT } from "@/lib/tools/developer/diff/hunks";
import { LANGUAGES, languageForFile, type LanguageId } from "@/lib/tools/developer/diff/language";
import type { DiffFile } from "@/lib/tools/developer/diff/model";
import { generatePatch, patchFileName } from "@/lib/tools/developer/diff/patch";
import { readTextFile } from "@/lib/tools/developer/diff/text-file";
import DiffStats from "./diff/DiffStats";
import DiffView, { SPLIT_QUERY } from "./diff/DiffView";
import { useHighlighters } from "./diff/useHighlighters";

const EXAMPLE_ORIGINAL = 'function hello() {\n  console.log("Hello");\n}';
const EXAMPLE_MODIFIED = "function hello(name) {\n  console.log(`Hello ${name}`);\n}";
const DEFAULT_NAMES = { old: "original.txt", new: "modified.txt" };
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const VIEWS = [
  { id: "split", label: "Split" },
  { id: "unified", label: "Unified" },
  { id: "patch", label: "Patch" },
] as const;

type View = (typeof VIEWS)[number]["id"];
type Side = "old" | "new";

export default function TextDiffChecker() {
  const [original, setOriginal] = useToolInput(EXAMPLE_ORIGINAL, () => {
    // Outside data replaces the example, so the example's other half and its language no longer apply.
    setModified("");
    setNames(DEFAULT_NAMES);
    if (!languageTouched) setLanguage(null);
  });
  const [modified, setModified] = useState(EXAMPLE_MODIFIED);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [fileErrors, setFileErrors] = useState<Partial<Record<Side, string>>>({});
  const [view, setView] = useState<View>("split");
  const [options, setOptions] = useState<CompareOptions>(NO_OPTIONS);
  const [fullFile, setFullFile] = useState(false);
  const [language, setLanguage] = useState<LanguageId | null>("javascript");
  const [languageTouched, setLanguageTouched] = useState(false);
  const canSplit = useMediaQuery(SPLIT_QUERY);

  const oldText = useDeferredValue(original);
  const newText = useDeferredValue(modified);
  const result = useMemo(() => computeDiff(oldText, newText, options), [oldText, newText, options]);
  const patch = useMemo(() => generatePatch(oldText, newText, names.old, names.new), [oldText, newText, names]);

  const highlight = useHighlighters(language ? [language] : [])(language);
  const rowCount = result.ok ? result.file.hunks[0].rows.length : 0;
  const highlights = useMemo(
    () => (result.ok && highlight && rowCount <= HIGHLIGHT_LINE_LIMIT ? highlightHunks(result.file.hunks, highlight) : null),
    [result, highlight, rowCount],
  );

  async function loadFile(side: Side, file: File) {
    const read = await readTextFile(file, MAX_FILE_BYTES);
    if (!read.ok) {
      setFileErrors((errors) => ({ ...errors, [side]: read.error }));
      return;
    }
    setFileErrors((errors) => ({ ...errors, [side]: undefined }));
    (side === "old" ? setOriginal : setModified)(read.text);
    setNames((current) => ({ ...current, [side]: file.name }));
    if (!languageTouched) setLanguage(languageForFile(file.name));
  }

  function swap() {
    setOriginal(modified);
    setModified(original);
    setNames((current) => ({ old: current.new, new: current.old }));
    setFileErrors((errors) => ({ old: errors.new, new: errors.old }));
  }

  const setOption = (key: keyof CompareOptions) => (checked: boolean) => setOptions((o) => ({ ...o, [key]: checked }));

  const empty = original === "" && modified === "";
  const viewOptions = canSplit ? VIEWS : VIEWS.filter((v) => v.id !== "split");
  const shownView: View = !canSplit && view === "split" ? "unified" : view;

  function body() {
    if (empty) return <p className="text-[color:var(--text-muted)]">Paste or drop text into both panels.</p>;

    if (shownView === "patch") {
      if (patch === null) return <TooSlow />;
      if (patch === "") return <p className="text-[color:var(--text-muted)]">No differences.</p>;
      return (
        <div className="space-y-2">
          <p className="text-xs text-[color:var(--text-muted)]">
            The patch compares the texts exactly, so the ignore options don&apos;t apply and it works with{" "}
            <code className="font-[family-name:var(--font-mono)]">git apply</code>.
          </p>
          <div className="font-[family-name:var(--font-mono)]">
            <CodeBlock code={patch} />
          </div>
        </div>
      );
    }

    if (!result.ok) return <TooSlow />;
    const { file, hiddenByOptions } = result;
    const changed = file.stats.added + file.stats.removed > 0;
    const newline = newlineNote(file);
    return (
      <div className="space-y-3">
        <DiffStats stats={file.stats} />
        {newline && <p className="text-xs text-[color:var(--text-muted)]">{newline}</p>}
        {language && rowCount > HIGHLIGHT_LINE_LIMIT && (
          <p className="text-xs text-[color:var(--text-muted)]">Syntax colors are off for texts this long.</p>
        )}
        {changed ? (
          <DiffView
            hunks={file.hunks}
            layout={shownView}
            context={fullFile ? "all" : DEFAULT_CONTEXT}
            highlights={highlights}
          />
        ) : (
          <p className="text-[color:var(--text-muted)]">
            No differences.{hiddenByOptions && " Some differences are hidden by the ignore options."}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <InputPanel label="Texts" wide>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <TextSide
            id="diff-original"
            label="Original"
            value={original}
            onChange={setOriginal}
            error={fileErrors.old}
            onFile={(file) => loadFile("old", file)}
          />
          <div className="flex items-center justify-center md:pt-7">
            <Button icon={ArrowLeftRight} size="sm" onClick={swap}>
              Swap
            </Button>
          </div>
          <TextSide
            id="diff-modified"
            label="Modified"
            value={modified}
            onChange={setModified}
            error={fileErrors.new}
            onFile={(file) => loadFile("new", file)}
          />
        </div>
      </InputPanel>

      <OutputPanel
        label="Differences"
        wide
        copyText={!empty && patch ? patch : undefined}
        outputType="diff"
        download={{ filename: patchFileName(names.new), mimeType: "text/x-diff" }}
      >
        <div className="space-y-4 font-[family-name:var(--font-ui)]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <SegmentedControl label="View" options={viewOptions} value={shownView} onChange={setView} />
            <label className="flex items-center gap-2 text-sm">
              <span className="text-[color:var(--text-muted)]">Language</span>
              <Select
                value={language ?? ""}
                onChange={(e) => {
                  setLanguage((e.target.value || null) as LanguageId | null);
                  setLanguageTouched(true);
                }}
                className="w-40"
              >
                <option value="">Plain text</option>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Checkbox checked={options.ignoreWhitespace} onChange={setOption("ignoreWhitespace")}>
              Ignore whitespace
            </Checkbox>
            <Checkbox checked={options.ignoreBlankLines} onChange={setOption("ignoreBlankLines")}>
              Ignore blank lines
            </Checkbox>
            <Checkbox checked={options.ignoreCase} onChange={setOption("ignoreCase")}>
              Ignore case
            </Checkbox>
            {shownView !== "patch" && (
              <Checkbox checked={fullFile} onChange={setFullFile}>
                Full file
              </Checkbox>
            )}
          </div>
          {body()}
        </div>
      </OutputPanel>
    </>
  );
}

interface TextSideProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onFile: (file: File) => void;
}

function TextSide({ id, label, value, onChange, error, onFile }: TextSideProps) {
  return (
    <Field label={label} htmlFor={id}>
      <CodeTextArea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FileDrop compact onFiles={([file]) => onFile(file)} />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-[color:var(--error)]">
          {error}
        </p>
      )}
    </Field>
  );
}

function TooSlow() {
  return <Alert title="Too slow to compare">These texts are too different to compare quickly.</Alert>;
}

/** A note when only one side ends with a newline: a real difference, but not one a line diff can show. */
function newlineNote({ noNewlineAtEnd }: DiffFile): string | null {
  if (!noNewlineAtEnd || noNewlineAtEnd.old === noNewlineAtEnd.new) return null;
  return `${noNewlineAtEnd.old ? "Original" : "Modified"} has no newline at the end; the other does.`;
}
```

- [ ] **Step 5: Run the registry test, type-check and lint**

Run: `npx vitest run registry/registry.test.ts && npx tsc --noEmit && npx next lint --dir components lib registry && echo clean`
Expected: registry tests PASS, then `clean`.

- [ ] **Step 6: Smoke-check in the running dev server**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tools/developer/text-diff-checker`
Expected: `200`. (If no dev server is running, start one with `npm run dev` in the background first. Never `next build` while it runs.)

- [ ] **Step 7: Commit**

```bash
git add components/tools/developer/TextDiffChecker.tsx registry/tools/developer/text-diff-checker.ts registry/tools/developer/index.ts components/catalog/icons.tsx registry/registry.test.ts
git commit -m "feat(diff): text diff checker tool"
```

---

### Task 9: Git Diff Viewer

**Files:**
- Create: `components/tools/developer/GitDiffViewer.tsx`, `registry/tools/developer/git-diff-viewer.ts`
- Modify: `registry/tools/developer/index.ts`, `components/catalog/icons.tsx`, `registry/registry.test.ts`

**Interfaces:**
- Consumes: `parseGitDiff`, `filePath`, `languagePath`, `MAX_GIT_DIFF_BYTES` (git-parse.ts); `GIT_DIFF_SAMPLE`; `DiffFile`, `FileStatus`, `Stats` (model.ts); `highlightHunks`, `HIGHLIGHT_LINE_LIMIT`, `SideHighlights`; `languageForFile`, `LanguageId`; `readTextFile`; `DiffView`, `SPLIT_QUERY`, `DiffLayout`, `DiffStats`, `useHighlighters`; `useMediaQuery`; `useToolInput`; panels with `wide`; `FileDrop compact`.
- Produces: tool `git-diff-viewer` at `/tools/developer/git-diff-viewer`, `consumes: ["diff", "text"]`.

- [ ] **Step 1: Write the failing registry tests**

In `registry/registry.test.ts`, change the url-encoder expectation to

```ts
    expect(ids(sendTargets(getToolById("url-encoder")!, "text"))).toEqual([
      "git-diff-viewer",
      "hash-generator",
      "regex-tester",
      "text-diff-checker",
    ]);
```

and add inside `describe("sendTargets")`:

```ts
  it("sends the text diff checker's patch to the git diff viewer", () => {
    expect(ids(sendTargets(getToolById("text-diff-checker")!, "diff"))).toEqual(["git-diff-viewer"]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run registry/registry.test.ts`
Expected: FAIL — `git-diff-viewer` missing from both results.

- [ ] **Step 3: Add the registry entry and icon**

`registry/tools/developer/git-diff-viewer.ts`:

```ts
import type { ToolConfig } from "@/registry/types";

const gitDiffViewer: ToolConfig = {
  id: "git-diff-viewer",
  category: "developer",
  title: "Git Diff Viewer",
  description: "Paste git diff output and read it file by file, with line numbers, changed words and syntax colors.",
  keywords: [
    "git diff",
    "git diff viewer",
    "paste git diff",
    "code diff viewer",
    "patch viewer",
    "view patch file",
    "git show",
    "diff viewer",
  ],
  actions: ["inspect"],
  component: () => import("@/components/tools/developer/GitDiffViewer"),
  consumes: ["diff", "text"],
  produces: [],
};

export default gitDiffViewer;
```

In `registry/tools/developer/index.ts` add `import gitDiffViewer from "./git-diff-viewer";` (after `gitCommandBuilder`) and append `gitDiffViewer` to `developerTools` after `textDiffChecker`.

In `components/catalog/icons.tsx` add `FileDiff,` to the lucide import (after `FileCog`) and `"git-diff-viewer": FileDiff,` after `"text-diff-checker": Diff,`.

- [ ] **Step 4: Write the component**

`components/tools/developer/GitDiffViewer.tsx`:

```tsx
"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import { CodeTextArea } from "@/components/ui/CodeField";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { filePath, languagePath, MAX_GIT_DIFF_BYTES, parseGitDiff } from "@/lib/tools/developer/diff/git-parse";
import { GIT_DIFF_SAMPLE } from "@/lib/tools/developer/diff/git-sample";
import { highlightHunks, HIGHLIGHT_LINE_LIMIT, type SideHighlights } from "@/lib/tools/developer/diff/highlight";
import { languageForFile, type LanguageId } from "@/lib/tools/developer/diff/language";
import type { DiffFile, FileStatus, Stats } from "@/lib/tools/developer/diff/model";
import { readTextFile } from "@/lib/tools/developer/diff/text-file";
import DiffStats from "./diff/DiffStats";
import DiffView, { SPLIT_QUERY, type DiffLayout } from "./diff/DiffView";
import { useHighlighters } from "./diff/useHighlighters";

/** Files longer than this start collapsed, so one huge file doesn't bury the rest. */
const COLLAPSE_ROWS = 500;

const VIEWS = [
  { id: "unified", label: "Unified" },
  { id: "split", label: "Split" },
] as const;

const STATUS: Record<FileStatus, { letter: string; label: string; tone: string }> = {
  modified: { letter: "M", label: "Modified", tone: "text-[color:var(--accent-warn-text)]" },
  added: { letter: "A", label: "Added", tone: "text-[color:var(--diff-add-text)]" },
  deleted: { letter: "D", label: "Deleted", tone: "text-[color:var(--diff-remove-text)]" },
  renamed: { letter: "R", label: "Renamed", tone: "text-[color:var(--accent-text)]" },
  copied: { letter: "C", label: "Copied", tone: "text-[color:var(--accent-text)]" },
  mode: { letter: "M", label: "Mode changed", tone: "text-[color:var(--text-muted)]" },
};

const HINT = "Paste the output of git diff, git show, or a .patch file.";

const rowCount = (file: DiffFile) => file.hunks.reduce((n, hunk) => n + hunk.rows.length, 0);

export default function GitDiffViewer() {
  const [text, setText] = useToolInput(GIT_DIFF_SAMPLE);
  const [fileError, setFileError] = useState<string>();
  const [view, setView] = useState<DiffLayout>("unified");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const canSplit = useMediaQuery(SPLIT_QUERY);
  const idPrefix = useId();

  const deferred = useDeferredValue(text);
  const result = useMemo(() => (deferred.trim() ? parseGitDiff(deferred) : null), [deferred]);
  const files = useMemo(() => (result?.ok ? result.files : []), [result]);

  const languages = useMemo(
    () => files.map((f) => languageForFile(languagePath(f))).filter((l): l is LanguageId => l !== null),
    [files],
  );
  const highlighterFor = useHighlighters(languages);
  const highlights = useMemo((): (SideHighlights | null)[] => {
    const tooLong = files.reduce((n, f) => n + rowCount(f), 0) > HIGHLIGHT_LINE_LIMIT;
    return files.map((f) => {
      const highlight = tooLong ? null : highlighterFor(languageForFile(languagePath(f)));
      return highlight ? highlightHunks(f.hunks, highlight) : null;
    });
  }, [files, highlighterFor]);

  const totals = files.reduce<Stats>(
    (sum, f) => ({
      added: sum.added + f.stats.added,
      removed: sum.removed + f.stats.removed,
      unchanged: sum.unchanged + f.stats.unchanged,
    }),
    { added: 0, removed: 0, unchanged: 0 },
  );

  const keyOf = (file: DiffFile, i: number) => `${i}:${filePath(file)}`;
  const headingId = (i: number) => `${idPrefix}-file-${i}`;
  const isOpen = (file: DiffFile, i: number) => open[keyOf(file, i)] ?? rowCount(file) <= COLLAPSE_ROWS;
  const setFileOpen = (file: DiffFile, i: number, value: boolean) => setOpen((o) => ({ ...o, [keyOf(file, i)]: value }));

  function jumpTo(file: DiffFile, i: number) {
    setFileOpen(file, i, true);
    const heading = document.getElementById(headingId(i));
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }

  async function loadFile(file: File) {
    const read = await readTextFile(file, MAX_GIT_DIFF_BYTES);
    if (!read.ok) {
      setFileError(read.error);
      return;
    }
    setFileError(undefined);
    setText(read.text);
  }

  function body() {
    if (!result) return <p className="text-[color:var(--text-muted)]">{HINT}</p>;
    if (!result.ok) {
      if (result.reason === "combined") {
        return (
          <Alert tone="warn" title="Combined diffs aren't supported yet">
            Merge commits shown as a combined diff (diff --cc) can&apos;t be displayed yet. Compare against one parent
            instead, e.g. git diff &lt;commit&gt;^1 &lt;commit&gt;.
          </Alert>
        );
      }
      if (result.reason === "too-large") return <Alert title="This diff is too large">Diffs over 5 MB can&apos;t be shown.</Alert>;
      return <Alert title="No diff found">{HINT}</Alert>;
    }

    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DiffStats stats={totals} files={files.length} />
          {canSplit && <SegmentedControl label="View" options={VIEWS} value={view} onChange={setView} />}
        </div>

        <nav aria-label="Files">
          <ul className="divide-y divide-[color:var(--border)] rounded-md border border-[color:var(--border)]">
            {files.map((file, i) => (
              <li key={keyOf(file, i)}>
                <a
                  href={`#${headingId(i)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jumpTo(file, i);
                  }}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color:var(--surface-raised)]"
                >
                  <StatusBadge status={file.status} />
                  <span className="min-w-0 flex-1 break-all font-[family-name:var(--font-mono)]">{filePath(file)}</span>
                  <FileCounts file={file} />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {files.map((file, i) => {
          const expanded = isOpen(file, i);
          return (
            <section
              key={keyOf(file, i)}
              aria-labelledby={headingId(i)}
              className="rounded-md border border-[color:var(--border)]"
            >
              <h3
                id={headingId(i)}
                tabIndex={-1}
                className="scroll-mt-20 rounded-md focus:outline focus:outline-1 focus:outline-[color:var(--accent)]"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setFileOpen(file, i, !expanded)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
                >
                  <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  <StatusBadge status={file.status} />
                  <span className="min-w-0 flex-1 break-all font-[family-name:var(--font-mono)]">{filePath(file)}</span>
                  <FileCounts file={file} />
                </button>
              </h3>
              {expanded && (
                <div className="border-t border-[color:var(--border)]">
                  {file.binary ? (
                    <p className="p-3 text-sm text-[color:var(--text-muted)]">Binary file, so there are no lines to show.</p>
                  ) : file.hunks.length === 0 ? (
                    <p className="p-3 text-sm text-[color:var(--text-muted)]">
                      {file.status === "mode" ? "Only the file's permissions changed." : "No line changes."}
                    </p>
                  ) : (
                    <DiffView hunks={file.hunks} layout={canSplit ? view : "unified"} context="none" highlights={highlights[i]} />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </>
    );
  }

  return (
    <>
      <InputPanel label="Git diff" wide>
        <div className="space-y-2">
          <CodeTextArea
            aria-label="Git diff"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={HINT}
            aria-describedby={fileError ? "git-diff-file-error" : undefined}
          />
          <FileDrop compact onFiles={([file]) => loadFile(file)} what="a .diff or .patch file" />
          {fileError && (
            <p id="git-diff-file-error" role="alert" className="text-xs text-[color:var(--error)]">
              {fileError}
            </p>
          )}
        </div>
      </InputPanel>

      <OutputPanel label="Changes" wide>
        <div className="space-y-4 font-[family-name:var(--font-ui)]">{body()}</div>
      </OutputPanel>
    </>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  const { letter, label, tone } = STATUS[status];
  return (
    <span title={label} className={`w-4 shrink-0 text-center font-[family-name:var(--font-mono)] font-semibold ${tone}`}>
      <span aria-hidden>{letter}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function FileCounts({ file }: { file: DiffFile }) {
  if (file.binary) return <span className="shrink-0 text-xs text-[color:var(--text-muted)]">binary</span>;
  return (
    <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs">
      <span className="sr-only">
        {file.stats.added} added, {file.stats.removed} removed
      </span>
      <span aria-hidden className="text-[color:var(--diff-add-text)]">
        +{file.stats.added}
      </span>{" "}
      <span aria-hidden className="text-[color:var(--diff-remove-text)]">
        −{file.stats.removed}
      </span>
    </span>
  );
}
```

- [ ] **Step 5: Run the registry tests, type-check and lint**

Run: `npx vitest run registry/registry.test.ts && npx tsc --noEmit && npx next lint --dir components lib registry && echo clean`
Expected: registry tests PASS, then `clean`.

- [ ] **Step 6: Smoke-check in the running dev server**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tools/developer/git-diff-viewer`
Expected: `200`.

- [ ] **Step 7: Commit**

```bash
git add components/tools/developer/GitDiffViewer.tsx registry/tools/developer/git-diff-viewer.ts registry/tools/developer/index.ts components/catalog/icons.tsx registry/registry.test.ts
git commit -m "feat(diff): git diff viewer tool"
```

---

### Task 10: Verification — dependency graph, full suite, live browser checks

**Files:**
- Create (scratchpad only, not committed): `<scratchpad>/diff-check.js`

**Interfaces:**
- Consumes: both tool pages on `http://localhost:3000`.
- Produces: evidence only.

- [ ] **Step 1: Confirm the parser-only import pulls in neither renderer nor jsdiff 8**

Run: `node -e 'require("diff2html/lib/diff-parser"); console.log(Object.keys(require.cache).filter(k => k.includes("node_modules")).map(k => k.split("node_modules/").pop()).join("\n"))'`
Expected: exactly `diff2html/lib/diff-parser.js`, `diff2html/lib/types.js`, `diff2html/lib/utils.js` — no `hogan`, no `diff/`.

- [ ] **Step 2: Full suite, types and lint**

Run: `npm test > .superpowers/full-test.log 2>&1; tail -5 .superpowers/full-test.log && npx tsc --noEmit && npx next lint && echo clean`
Expected: all tests pass (previous total + this plan's new tests), then `clean`.

- [ ] **Step 3: Write the live check script**

Playwright lives in the scratchpad (`npm i playwright@1.56.1` there if missing; the browser cache has build 1194). `<scratchpad>/diff-check.js`:

```js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:3000/tools/developer";
const out = (k, v) => console.log(`${v ? "PASS" : "FAIL"}  ${k}`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // Text Diff Checker
  await p.goto(`${BASE}/text-diff-checker`, { waitUntil: "networkidle" });
  const diffOut = p.locator('section[aria-label="Differences"]');
  out("pre-fill shows stats +2 −2", (await diffOut.innerText()).includes("+2") && (await diffOut.innerText()).includes("−2"));
  out("changed words marked", (await diffOut.locator('[class*="diff-add-word"]').count()) > 0);
  await p.waitForTimeout(800);
  out("syntax colors loaded", (await diffOut.locator(".hljs-keyword").count()) > 0);
  out("split layout on desktop", (await diffOut.locator("tr").first().locator("td").count()) === 6);
  await p.getByRole("radio", { name: "Unified" }).click();
  out("unified layout", (await diffOut.locator("tbody tr").first().locator("td").count()) === 4);
  await p.getByRole("button", { name: "Swap" }).click();
  out("swap exchanges texts", (await p.getByLabel("Original").inputValue()).includes("hello(name)"));
  await p.getByRole("button", { name: "Swap" }).click();
  await p.getByLabel("Modified").fill('function hello() {\n  console.log("Hello");\n}');
  await p.waitForTimeout(300);
  out("identical → No differences.", (await diffOut.innerText()).includes("No differences."));
  await p.getByLabel("Modified").fill('FUNCTION hello() {\n  console.log("Hello");\n}');
  await p.getByRole("checkbox", { name: "Ignore case" }).check();
  await p.waitForTimeout(300);
  out("hidden-by-options note", (await diffOut.innerText()).includes("Some differences are hidden by the ignore options."));
  await p.getByRole("radio", { name: "Patch" }).click();
  const patchText = await diffOut.locator("pre").innerText();
  out("patch view has a/ b/ headers", patchText.startsWith("--- a/original.txt\n+++ b/modified.txt"));
  await diffOut.getByRole("button", { name: "Copy" }).click();
  const clipboard = await p.evaluate(() => navigator.clipboard.readText());
  out("copy puts the patch on the clipboard", clipboard.startsWith("--- a/original.txt") && clipboard.includes("+FUNCTION hello() {"));
  const [download] = await Promise.all([p.waitForEvent("download"), diffOut.getByRole("button", { name: "Download modified.patch" }).click()]);
  out("download named modified.patch", download.suggestedFilename() === "modified.patch");
  const tmp = path.join(__dirname, "dropped.py");
  fs.writeFileSync(tmp, "def f():\n    return 1\n");
  await p.locator('input[type="file"]').first().setInputFiles(tmp);
  await p.waitForTimeout(300);
  out("file drop fills Original and picks Python", (await p.getByLabel("Original").inputValue()).startsWith("def f()") && (await p.getByLabel("Language").inputValue()) === "python");
  await p.getByRole("button", { name: /Send to/ }).click();
  await p.getByRole("menuitem", { name: /Git Diff Viewer/ }).click();
  await p.waitForURL(/git-diff-viewer/);
  out("Send to opens the Git Diff Viewer with the patch", (await p.getByLabel("Git diff").inputValue()).startsWith("--- a/"));

  // Git Diff Viewer
  await p.goto(`${BASE}/git-diff-viewer`, { waitUntil: "networkidle" });
  const changes = p.locator('section[aria-label="Changes"]');
  out("3 files changed", (await changes.innerText()).includes("3 files changed"));
  out("gap label", (await changes.innerText()).includes("Lines 7–19 aren't in this diff"));
  out("binary note", (await changes.innerText()).includes("Binary file"));
  await changes.getByRole("navigation", { name: "Files" }).getByRole("link", { name: /utils\.ts/ }).click();
  const focused = await p.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.textContent);
  out("jump moves focus to the file heading: " + focused, focused.startsWith("H3:") && focused.includes("utils.ts"));
  const toggle = changes.getByRole("button", { name: /src\/greet\.ts/ });
  await toggle.click();
  out("collapse hides rows", (await toggle.getAttribute("aria-expanded")) === "false");
  await p.getByLabel("Git diff").fill("hello world");
  await p.waitForTimeout(300);
  out("junk → No diff found", (await changes.innerText()).includes("No diff found"));

  // Mobile + light theme
  for (const theme of ["dark", "light"]) {
    for (const tool of ["text-diff-checker", "git-diff-viewer"]) {
      const m = await browser.newPage({ viewport: { width: 375, height: 800 } });
      await m.goto(`${BASE}/${tool}`, { waitUntil: "networkidle" });
      await m.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      out(`${tool} ${theme} 375px: no page scroll`, !overflow);
      out(`${tool} ${theme} 375px: no Split option`, (await m.getByRole("radio", { name: "Split" }).count()) === 0);
      await m.screenshot({ path: path.join(__dirname, `${tool}-${theme}-mobile.png`), fullPage: true });
      await m.close();
    }
  }
  await p.goto(`${BASE}/text-diff-checker`, { waitUntil: "networkidle" });
  await p.screenshot({ path: path.join(__dirname, "text-diff-desktop.png"), fullPage: true });
  await p.goto(`${BASE}/git-diff-viewer`, { waitUntil: "networkidle" });
  await p.screenshot({ path: path.join(__dirname, "git-diff-desktop.png"), fullPage: true });

  out(`no console errors (${errors.length})`, errors.length === 0);
  errors.forEach((e) => console.log("   ", e));
  await browser.close();
})();
```

- [ ] **Step 4: Run it**

Run: `cd <scratchpad> && node diff-check.js`
Expected: every line `PASS`. For any `FAIL`, use superpowers:systematic-debugging; a selector that doesn't match the real (correct) UI is a script bug — fix the script and ledger it; a real UI defect is fixed test-first where logic is involved.

- [ ] **Step 5: Look at the screenshots**

Read `text-diff-desktop.png`, `git-diff-desktop.png` and the four mobile screenshots. Expected: tinted rows and word marks readable in both themes, syntax colors visible, no clipped or overlapping controls.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(diff): issues found in live checks"
```

(Skip if nothing changed.)
