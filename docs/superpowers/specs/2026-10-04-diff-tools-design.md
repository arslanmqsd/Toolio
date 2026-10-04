# Diff Tools (Text Diff Checker + Git Diff Viewer) — Design

Date: 2026-10-04
Status: Draft, awaiting review

## Goal

Two separate developer-category tools that share one diff core and one renderer:

- **Text Diff Checker** (`/tools/developer/text-diff-checker`): paste or drop two texts, see what changed.
- **Git Diff Viewer** (`/tools/developer/git-diff-viewer`): paste `git diff` / `git show` / `.patch` output, read it
  file by file.

**Success:**

- A developer pastes two versions of a snippet and immediately sees changed lines *and* the changed words inside them,
  with line numbers that match their originals, then copies or downloads a patch that applies cleanly.
- A developer pastes a multi-file `git diff`, sees every file with its status and +/− counts, jumps to any file, and
  reads it split or unified, with syntax colors.

## Scope

In v1:

- Shared diff model, `computeDiff`, collapsing of unchanged lines, changed-word highlighting, `DiffView`, `DiffStats`.
- Text Diff Checker: two inputs, file drop, swap, Split / Unified / Patch views, ignore whitespace / blank lines /
  case, full-file toggle, copy patch, download `.patch`.
- Git Diff Viewer: paste or drop a diff, file list with status and counts, jump to file, collapsible file sections,
  Split / Unified.
- Syntax highlighting by file extension (11 languages, lazy-loaded) in both tools.
- New `diff` data type and paste detector, so a pasted diff anywhere offers the Git Diff Viewer, and the Text Diff
  Checker's patch can be sent to it.

Out of v1:

- Combined merge diffs (`diff --cc` / `diff --combined`): shown as a notice, not rendered.
- Expanding context that isn't in a pasted diff (the Git Diff Viewer only has what was pasted).
- Highlight.js auto-detection; languages beyond the 11 listed.
- Character-level (rather than word-level) intra-line highlighting.
- Three-way / merge-conflict views; directory comparison.

## Dependencies

- `diff` (jsdiff) `^9` — line and word diffing (`diffArrays` with `comparator` and `timeout`, `diffWordsWithSpace`,
  `createPatch`).
- `diff2html` `3.4.x` — **parser only**, imported from `diff2html/lib-esm/diff-parser` (pulls in only its types and
  utils, no templates or rendering). diff2html's HTML renderer and CSS are not used.
- `highlight.js` `^11` — `highlight.js/lib/core` plus individually registered languages, loaded with dynamic `import()`.

Verified against these versions: diff2html's parser handles renames and binary files and returns typed lines with real
old/new numbers; `diffArrays` with a `comparator` returns the *new* side's value for common runs, so original text for
each side is recovered by walking both arrays by `count`.

diff2html depends on `diff@^8`; the bundle may carry both majors (diff2html's copy is not reached by the parser-only
import, so tree-shaking should drop it — confirm in the build output, not assumed).

## Architecture

```text
Text Diff Checker:  texts ──→ compare.ts (diffArrays + comparator) ─┐
                                                                    ├──→ DiffFile[] ──→ <DiffView> / <DiffStats>
Git Diff Viewer:    pasted diff ──→ diff2html parser ──→ git-parse.ts ┘
```

```text
lib/tools/developer/diff/
├── model.ts        # DiffFile, Hunk, Row, Stats, WordRange types (the shared contract)
├── lines.ts        # splitLines: CRLF/LF, trailing-newline flag
├── compare.ts      # computeDiff(original, modified, options) → CompareResult
├── words.ts        # pairChanges + changed-word ranges for removed/added pairs
├── hunks.ts        # toHunks(rows, context) → visible segments + hidden gaps
├── patch.ts        # generatePatch(original, modified, oldName, newName)
├── git-parse.ts    # parseGitDiff(text) → GitParseResult (diff2html adapter)
├── language.ts     # file name → language id; LANGUAGES list for the picker
└── highlight.ts    # hljs HTML → segments; split by line; merge word ranges
components/tools/developer/
├── TextDiffChecker.tsx
├── GitDiffViewer.tsx
└── diff/
    ├── DiffView.tsx      # split | unified rows for one DiffFile
    ├── DiffStats.tsx     # "+12 −4 · 30 unchanged" (and "3 files changed")
    └── useHighlight.ts   # lazy-loads hljs, returns per-line segments
```

Every `lib/` module has a sibling `.test.ts`. Nothing in `compare.ts`, `hunks.ts`, `words.ts`, `DiffView` or
`DiffStats` knows about git; only `git-parse.ts` and `GitDiffViewer.tsx` do.

## Shared core

### Model

```ts
type RowKind = "context" | "add" | "remove" | "ignored";
interface WordRange { start: number; end: number }            // char offsets into Row.text
interface Row {
  kind: RowKind;
  oldNo?: number;   // set for context, remove, ignored-on-old-side
  newNo?: number;   // set for context, add, ignored-on-new-side
  text: string;     // the line exactly as written, without its newline or diff marker
  words?: WordRange[]; // changed ranges, only on paired add/remove rows
}
interface Hunk { header?: string; rows: Row[] }    // header: the "@@ … @@ fn()" line (git) — absent for text diffs
interface Stats { added: number; removed: number; unchanged: number }
type FileStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "mode";
interface DiffFile {
  oldName: string; newName: string; status: FileStatus; binary: boolean;
  hunks: Hunk[];      // text diff: one hunk holding every row; git: the pasted hunks
  stats: Stats;
  noNewlineAtEnd?: { old: boolean; new: boolean };
}
```

`ignored` rows do not count in `Stats`.

### `computeDiff(original, modified, options)`

Options: `{ ignoreWhitespace, ignoreBlankLines, ignoreCase }` (all default `false`).

1. `splitLines` each side on `\r\n` or `\n`. A final newline does not create an empty last line; whether each side
   ended with one is recorded in `noNewlineAtEnd`, shown as a note under the diff, and is not a row-level change.
2. Each line gets a comparison key: ignore whitespace removes all whitespace (like `git diff -w`); ignore case
   lowercases. The original line is kept for display.
3. With ignore blank lines, lines whose key is empty are taken out of the comparison but kept, with their real numbers,
   and re-inserted in order as `ignored` rows on their own side.
4. `diffArrays(oldKeys, newKeys, { comparator: (a, b) => a === b, timeout: 1000 })`. Walk the result by `count`,
   advancing an index into each side, so every row carries that side's original text and real line number.
5. Each run of removed rows directly followed by added rows is paired one-to-one in order (`pairChanges`); surplus rows
   stay unpaired. Each pair gets changed-word ranges from `diffWordsWithSpace` on the original texts. Pairs where
   either line is over 1,000 characters get no word ranges.
6. Returns `{ ok: true, file: DiffFile }`, or `{ ok: false, reason: "timeout" }` when jsdiff returns `undefined`.

`identical` is derived: `stats.added + stats.removed === 0`. The UI also reports whether the raw texts differ while the
keyed comparison does not ("Differences hidden by ignore options").

### `toHunks(rows, context)`

A view filter over a full row list. `context` is a number (default 3) or `"all"`.

- `"all"`: one segment, no gaps.
- Otherwise: rows within `context` of any `add`/`remove` row are visible; each maximal hidden run becomes a gap
  `{ kind: "gap", from, to, count }`. A gap of fewer than 2 rows is shown instead of hidden (hiding one line saves
  nothing). If nothing changed, the whole file is one gap.
- The UI's "Show 42 unchanged lines" expands a single gap in place (component state: a set of expanded gap starts).

### `DiffView`

Props: `file: DiffFile`, `layout: "split" | "unified"`, `context: number | "all" | "none"` (`"none"` = render hunks as
given, used by the Git Diff Viewer), `language: LanguageId | null`, `gapLabel?` for non-expandable gaps.

- **Split:** two columns. Paired remove/add rows share a line; unpaired rows leave the other side blank. Context rows
  appear on both sides.
- **Unified:** one column, two number gutters, `+`/`−`/space marker.
- Below `sm` the layout is always unified (CSS: the split grid is not rendered under `sm`; the toggle's Split option is
  disabled there with a title explaining why).
- Line numbers and markers are `select-none`, so a copy grabs only code. Long lines scroll horizontally inside the
  diff, never the page.
- Each add/remove row has a visually hidden "Added line" / "Removed line" prefix; changed words are `<mark>`-styled
  spans (stronger tint), so meaning never relies on color alone.
- Renders the first 2,000 rows, then a "Show all N rows" button.
- Colors: new tokens `--diff-add-bg`, `--diff-add-word`, `--diff-remove-bg`, `--diff-remove-word`, `--diff-gutter`
  defined for light and dark in globals, following the existing `:root` / dark-theme pattern.

### `DiffStats`

`+12 −4 · 30 unchanged` with green/red text plus `aria-label` "12 lines added, 4 removed, 30 unchanged". Optional
`files` count renders "3 files changed" first. Used by both tools.

## Text Diff Checker

Registry: `id: "text-diff-checker"`, category developer, `actions: ["compare"]`, `consumes: ["text", "code"]`,
`produces: ["diff"]`. Keywords: "diff checker", "text diff", "compare text", "compare two files", "text compare",
"find differences", "compare code", "diff online". Icon: lucide `Diff`.

### Layout

```text
[Original ▢ drop file]            [⇄ Swap]             [Modified ▢ drop file]
 textarea                                               textarea
───────────────────────────────────────────────────────────────────────────
View: (Split | Unified | Patch)                     Language: [Plain text ▾]
☐ Ignore whitespace  ☐ Ignore blank lines  ☐ Ignore case  ☐ Full file
+3 −2 · 1 unchanged                      [Copy patch] [Download .patch] [Send to…]
───────────────────────────────────────────────────────────────────────────
<DiffView>  — or in Patch view: <CodeBlock> with the unified patch
```

Inputs stack vertically below `md`, Swap between them.

### Behaviour

- **Workbench:** the Original input registers as the tool's main input, so "Use pasted text" fills Original.
- **Files:** each input has a `FileDrop` (drop or choose). Read as UTF-8 text. Files over 2 MB, or containing a NUL
  byte in the first 8 KB, are rejected with an inline error under that input. The file name becomes that side's name in
  the patch headers and, while the language picker hasn't been touched, sets the language via `language.ts`.
- **Pre-fill:** Original `function hello() {\n  console.log("Hello");\n}`, Modified
  `function hello(name) {\n  console.log(\`Hello ${name}\`);\n}`, language JavaScript.
- **Swap** exchanges the texts and the file names.
- **Live:** the diff recomputes from `useDeferredValue` copies of both texts; no Compare button.
- **Patch view / copy / download:** `generatePatch(original, modified, oldName, newName)` wraps `createPatch` on the
  raw texts (names default to `original.txt` / `modified.txt`). It ignores the ignore options, and the Patch view says
  so in one muted line, so the patch applies cleanly. Copy, Download (`<newName-stem>.patch`, `text/x-diff`) and
  Send to… (type `diff`) always use this patch regardless of the current view.
- **Language picker:** "Plain text" plus the 11 languages.
- **Full file** sets `context` to `"all"`; off means 3.

### States

- Both inputs empty: muted "Paste or drop text into both panels." No stats, copy/download disabled.
- Identical: "No differences." — plus "Some differences are hidden by the ignore options." when the raw texts differ.
- Timeout: `Alert` tone error, "These texts are too different to compare quickly." `generatePatch` uses the same
  timeout; when it also fails, Copy / Download / Send to… are disabled and Patch view shows the same alert.

## Git Diff Viewer

Registry: `id: "git-diff-viewer"`, category developer, `actions: ["inspect"]`, `consumes: ["diff", "text"]`,
`produces: []`. Keywords: "git diff", "git diff viewer", "paste git diff", "code diff viewer", "patch viewer",
"view patch file", "git show", "diff viewer". Icon: `FileDiff`.

### Layout

```text
[ textarea: paste git diff, git show or a .patch ]           [drop .diff/.patch]
───────────────────────────────────────────────────────────────────────────
3 files changed  +24 −9                                   View: (Split | Unified)
 M  src/app.ts                     +12 −4
 R  old/util.ts → lib/util.ts       +2 −1
 A  logo.png                        binary
───────────────────────────────────────────────────────────────────────────
▾ src/app.ts   M  +12 −4
  @@ -10,6 +10,8 @@ function init()
  …rows…
  ⋯ Lines 17–40 aren't in this diff
▾ old/util.ts → lib/util.ts …
```

### `parseGitDiff(text)` (git-parse.ts)

- Input over 5 MB → `{ ok: false, reason: "too-large" }`.
- If the text contains a line starting `diff --cc ` or `diff --combined ` → `{ ok: false, reason: "combined" }`.
- Calls diff2html's `parse`. Zero files → `{ ok: false, reason: "empty" }`.
- Each file → `DiffFile`:
  - Names: strip `a/` `b/` prefixes (diff2html does this); `/dev/null` side → status added/deleted.
  - Status: `isNew` → added, `isDeleted` → deleted, `isRename` → renamed, `isCopy` → copied, only mode lines and no
    blocks → mode, else modified. `isBinary` → `binary: true`.
  - Each diff2html block → `Hunk { header: block.header }`; lines map `insert→add`, `delete→remove`,
    `context→context`, keeping `oldNumber`/`newNumber`; the leading `+`/`-`/space is removed from `content`.
  - `\ No newline at end of file` lines become `noNewlineAtEnd` flags, not rows.
  - Removed/added runs inside each hunk are paired with the same `pairChanges` from `words.ts`.
  - Stats from the mapped rows (not diff2html's counts, so both tools count the same way).
- `git show` / `format-patch` commit and mail headers are skipped by the parser; nothing extra needed. Test-pinned.
- Returns `{ ok: true, files: DiffFile[] }`.

### Behaviour

- **Workbench:** the textarea is the main input; a pasted diff (detector, below) offers "Use pasted diff".
- **Pre-fill:** a small sample with one modified `.ts` file (two hunks), one rename with a one-line change, and one new
  binary file.
- **File drop:** `.diff`, `.patch`, or any text file; same 5 MB / NUL rules.
- **Totals:** `DiffStats` with summed added/removed across files and the file count (no "unchanged" for git diffs).
- **File list:** status letter badge (M/A/D/R/C, with `title` text), path (renames as `old → new`), counts or
  "binary". Each entry is a link to `#file-<index>`; activating it scrolls to the section (with `scroll-margin-top` so
  the sticky header doesn't hide it) and moves focus to the section heading (`tabIndex={-1}`).
- **File sections:** `<section>` with a heading button that collapses/expands (`aria-expanded`). Files over 500 rows
  start collapsed. Binary and mode-only files show a one-line note and no rows.
- **Gaps:** between hunks, a non-expandable "Lines X–Y aren't in this diff" row, derived from consecutive hunks'
  old-side numbers.
- **Language:** per file from its new name (old name for deletions) via `language.ts`.
- **Live:** re-parses from a deferred copy of the textarea.

### States

- Empty textarea: muted "Paste the output of `git diff`, `git show`, or a .patch file."
- `empty`: `Alert` "No diff found. Paste the output of `git diff`, `git show`, or a .patch file."
- `combined`: `Alert` warn "Merge-commit combined diffs (`diff --cc`) aren't supported yet."
- `too-large`: `Alert` "This diff is over 5 MB."

## Data type and paste detection

- `registry/data-types.ts`: add `"diff"` with label "diff".
- `components/workbench/detectors.ts`: `PasteType` gains `"diff"`. `detectType` returns `"diff"` when the trimmed text
  starts with `diff --git `, or starts with `commit <hex>` / `From <hex>` and contains a `diff --git ` line, or
  contains a `--- ` line immediately followed by a `+++ ` line and later an `@@ ` line. Checked before the JSON check;
  cURL/JWT/cron can't match these shapes.

## Syntax highlighting

### `language.ts`

`LANGUAGES`: javascript, typescript, json, css, xml (label "HTML / XML"), python, go, sql, yaml, bash, markdown.
`languageForFile(name)` maps extensions (`js mjs cjs jsx`, `ts tsx mts cts`, `json`, `css scss less`→css,
`html htm xml svg vue`→xml, `py`, `go`, `sql`, `yml yaml`, `sh bash zsh`, `md markdown`) and the base names
`Dockerfile`/`Makefile` → `null`, `.bashrc`/`.zshrc` → bash. Unknown → `null` (plain text).

### `highlight.ts` (pure, testable without a DOM)

- `toSegments(html)`: parses highlight.js output — only `<span class="…">`, `</span>` and the escapes `&amp; &lt; &gt;
  &quot; &#x27;` — into `{ text, classes: string[] }[]`, keeping a stack so nested spans carry all classes. Any other
  markup throws (it can't occur with hljs output; the test pins this).
- `splitSegmentsByLine(segments)`: splits on `\n`, carrying open classes onto the next line, so multi-line comments and
  strings stay colored.
- `mergeWordRanges(lineSegments, words)`: splits segments at word-range boundaries and flags the pieces inside a range
  as `changed`.
- No `dangerouslySetInnerHTML`: `DiffView` renders segments as React `<span>`s.

### `useHighlight.ts`

- `language === null` → returns `null`; nothing loaded.
- Otherwise dynamic-imports `highlight.js/lib/core` and the one language module, registers it once, then highlights.
- Text Diff Checker: each side's full text, highlighted once per change, split into lines and indexed by line number.
- Git Diff Viewer: each hunk's old-side and new-side text (context+remove, context+add) separately. A comment that
  starts before a hunk can be colored wrongly — accepted limit.
- Skipped above 5,000 total lines, with a muted "Syntax colors are off for diffs this large."
- Until loaded, rows render plain; no layout shift.
- Colors: a dozen `hljs-*` classes (keyword, string, number, comment, title, attr, built_in, literal, type, meta,
  variable, tag) mapped to new `--syntax-*` tokens for light and dark in globals. No highlight.js theme CSS.

## Error handling summary

| Condition | Result |
|---|---|
| Diff too slow (jsdiff timeout 1 s) | Error alert, no rows |
| File > 2 MB (text) / > 5 MB (git) or binary | Inline error under the input, input unchanged |
| Pasted git diff unparseable | "No diff found" alert |
| Combined merge diff | Warn alert |
| > 2,000 rows | First 2,000, "Show all N rows" |
| > 5,000 lines for highlighting | Plain rows, note |

## Testing

Vitest, logic only (the repo has no component tests):

- `lines`: LF, CRLF, mixed, trailing newline flag, empty string.
- `compare`: plain add/remove/change; real line numbers on both sides; ignore whitespace; ignore case shows original
  casing; ignore blank lines yields `ignored` rows with real numbers and excludes them from stats; identical;
  no-newline-at-end not counted as a change; timeout path (stubbed tiny timeout on a large random input); pairing and
  word ranges on the pre-fill example.
- `words`: pairing with surplus rows; ranges for a one-word change; 1,000-character cutoff.
- `hunks`: context 3; `"all"`; gap smaller than 2 shown; no changes → one gap; changes at file start/end.
- `patch`: headers use the given names; `---`/`+++`/`@@` present; ignores ignore options.
- `git-parse`: modified two-hunk file; rename; binary new file; deleted file; mode-only; no-newline marker; `git show`
  header skipped; `diff --cc` → combined; junk → empty; > 5 MB → too-large; stats match rows.
- `language`: each extension group, case-insensitive, unknown → null.
- `highlight`: nested spans, escapes, unknown markup throws, multi-line comment split carries classes, word-range merge
  at segment boundaries.
- `detectors`: diff shapes detected; a JSON or cURL paste still detects as before; prose with `---` alone stays text.
- Existing registry/catalog integrity tests cover the two new entries.

Live headless-browser checklist against `next dev`: both tools in light and dark and at 375px (no page-level horizontal
scroll); pre-fill renders with word highlights and syntax colors; swap; file drop; ignore toggles; Patch view, copy and
download; Send to… opens the Git Diff Viewer with the patch; Git Diff Viewer file-list jump moves focus; collapse;
gap labels; no console errors.

## Build order

1. Shared core (model, lines, compare, words, hunks, patch) + `DiffView` + `DiffStats` + tokens.
2. Text Diff Checker + registry entry + `diff` data type.
3. `git-parse.ts` + paste detector.
4. Git Diff Viewer + registry entry.
5. Syntax highlighting (language, highlight, useHighlight, tokens) wired into both tools.

Both tools are fully usable before step 5.
