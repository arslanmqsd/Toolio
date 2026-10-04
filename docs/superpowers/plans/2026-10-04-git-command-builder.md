# Git Command Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a task-based Git Command Builder to Toolio's developer tools: search "undo last commit", fill a field or two, copy a correct, explained, risk-flagged command.

**Architecture:** Pure logic in `lib/tools/developer/git/`: a typed catalog of ~67 tasks, each with fields and a pure `build(args) → Step[]`; a resolver that validates field values, inserts `<placeholders>` for empty required fields and shell-quotes everything else. The UI in `components/tools/developer/` is a thin client: a combobox task picker, a task form and an output view. The selected task lives in `?task=`.

**Tech Stack:** Next.js 14 (app router, static tool pages), React 18, TypeScript strict, Tailwind 3.4, fuse.js 7, lucide-react, Vitest 5 (logic tests only; no component tests in this repo).

**Spec:** `docs/superpowers/specs/2026-10-04-git-command-builder-design.md`

## Global Constraints

- Tool id `git-command-builder`, category `developer`, title "Git Command Builder", `actions: ["generate"]`, `consumes: []`, `produces: ["git"]`.
- Fully client-side: no network or AI calls.
- Modern syntax: `git switch` / `git restore`, never `checkout` for those jobs.
- Revisions are written `HEAD~N`, never `HEAD^`.
- Output targets POSIX shells (bash/zsh). Every user value goes through `quote()`.
- Danger levels: `safe | caution | destructive`. Every destructive step has a `warning`.
- Danger is shown as icon plus text, never colour alone. Mobile: no horizontal page scroll.
- Do **not** run `next build` (it overwrites `.next/` under a running `next dev`). Verify with `npx tsc --noEmit`, `npm run lint`, `npm test`.
- Match the surrounding code style: double quotes, 2-space indent, sparse comments that explain why, `@/` imports.

## Refinements to the spec

These were settled while planning. Where the plan and the spec differ, the plan wins.

1. `build` receives an `Args` helper instead of raw values (`a.q("name")`, `a.flag("force")`…). That lets the resolver substitute `<placeholder>` text for empty required fields without the placeholder ever passing through `quote()`. If it did pass through, a user typing `<x>` would come out bare and act as a shell redirect.
2. Field values are `string | boolean`. Number fields hold strings and are validated as integers.
3. There is a separate field kind `"prose"` (rendered with `TextInput`) for commit and tag messages. `"text"` uses the monospace `CodeInput`.
4. Conditional fields use `shownWhen?: (values) => boolean`. Hidden fields are neither validated nor required.
5. Force push has no `saferAlternative`, because the safer variant is the same task with the checkbox unticked. The warning says so instead.
6. Validators live in `ref-name.ts`: `refNameError`, `revisionError`, `pathError`, `pathsError`, `integerError`, `urlError` and `singleLineError`. Path fields reject a leading `-` so a path can't be read as an option.
7. `quote()` also quotes `{` `}` (brace expansion), a leading `=` (zsh), and `=~` or `:~` inside a word.
8. The generic fuzzy ranking in `lib/search/search.ts` is extracted to `lib/search/fuzzy.ts` and reused for task search. Site search behaviour doesn't change.

## Review Focus

1. **Shell metacharacters in free text.** A commit message like ``don't expand $HOME or `ls` `` must reach Git literally. The test lives in Task 4, `commits.test.ts`.
2. **A required field cleared after it had a value** (e.g. the commit count emptied). The output shows `HEAD~<n>` with Copy disabled. It never shows `HEAD~` or `HEAD~0`. The test lives in Task 5, `undo.test.ts`.
3. **Pasted values with surrounding whitespace** (`"  feature/x  "`) are trimmed and accepted. The test lives in Task 3, `build.test.ts`.
4. **A value starting with `-`** (`-f` as a branch name, `-rf` as a path) is rejected so it can't be read as an option. The tests live in Task 2, `ref-name.test.ts`, and Task 3, `build.test.ts`.
5. **Glob and regex characters in values.** `src/*.ts` stays quoted so Git, not the shell, expands it, and a base branch like `release-1.0` is regex-escaped in the cleanup pipe. The tests live in Task 5, `undo.test.ts`, and Task 7, `cleanup.test.ts`.

---

## File Structure

```
lib/search/fuzzy.ts                         NEW   generic fuse.js ranking (extracted)
lib/search/search.ts                        MOD   uses fuzzy.ts
lib/hooks/useQueryParam.ts                  NEW   URL query param as state
lib/tools/developer/git/
  types.ts                                  NEW   Danger, GitCategoryId, Field, Args, Part, Step, Task
  quote.ts        quote.test.ts             NEW   POSIX quoting, escapeEre
  ref-name.ts     ref-name.test.ts          NEW   field validators
  build.ts        build.test.ts             NEW   resolveTask, defaultValues, maxDanger, …
  search.ts       search.test.ts            NEW   task search
  catalog/
    helpers.ts                              NEW   part/step/field builders shared by catalog files
    test-helpers.ts                         NEW   command()/danger()/resolve() for catalog tests
    index.ts                                NEW   GIT_CATEGORIES, TASKS, getTask, QUICK_START
    catalog.test.ts                         NEW   integrity checks
    branches.ts  commits.ts  remote.ts  undo.ts  stash.ts
    merge-rebase.ts  tags.ts  inspect.ts  cleanup.ts      (+ one .test.ts each)
components/tools/developer/
  GitCommandBuilder.tsx                     NEW   state + panels
  git/DangerBadge.tsx                       NEW
  git/TaskPicker.tsx                        NEW   search combobox + chips + list
  git/TaskForm.tsx                          NEW   fields for the chosen task
  git/CommandOutput.tsx                     NEW   steps, warnings, explanations, quick start
registry/data-types.ts                      MOD   add "git"
registry/tools/developer/git-command-builder.ts  NEW
registry/tools/developer/index.ts           MOD   register
components/catalog/icons.tsx                MOD   GitBranch icon
```

---

### Task 1: Extract generic fuzzy search

A refactor with no behaviour change. The existing `lib/search/search.test.ts` is the safety net.

**Files:**
- Create: `lib/search/fuzzy.ts`
- Modify: `lib/search/search.ts` (whole file)
- Test: `lib/search/search.test.ts` (unchanged, must stay green)

**Interfaces:**
- Produces: `createFuzzySearch<T>(items: readonly T[], keys: FuseOptionKey<T>[]): (query: string, limit?: number) => FuzzyMatch<T>[]` and `interface FuzzyMatch<T> { item: T; score: number }`. `limit` defaults to `Infinity`.

- [ ] **Step 1: Run the existing search tests to get a baseline**

Run: `npx vitest run lib/search`
Expected: PASS.

- [ ] **Step 2: Create `lib/search/fuzzy.ts`**

```ts
import Fuse, { type FuseOptionKey } from "fuse.js";

export interface FuzzyMatch<T> {
  item: T;
  /** 0 = perfect match, 1 = no match. */
  score: number;
}

// Filler words in task phrasings ("convert THIS json TO typescript") that would
// otherwise fuzzy-match unrelated items.
const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "can", "do", "for", "from", "how", "i", "in", "into", "is", "it", "me",
  "my", "need", "of", "on", "or", "please", "some", "the", "this", "that", "to", "want", "what", "with",
]);

const MAX_SCORE = 0.45;

/** Ranks `items` against free-text queries, by the weighted `keys`. */
export function createFuzzySearch<T>(items: readonly T[], keys: FuseOptionKey<T>[]) {
  const fuse = new Fuse(items, { keys, includeScore: true, ignoreLocation: true, threshold: 0.4 });

  function scores(query: string): Map<T, number> {
    return new Map(fuse.search(query).map((r) => [r.item, r.score ?? 1]));
  }

  return function search(query: string, limit = Infinity): FuzzyMatch<T>[] {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return [];

    // Whole-query match catches phrasings that are close to a keyword.
    const whole = scores(trimmed);

    // Per-word match catches the same intent phrased differently: the item's
    // score is the average over meaningful words, with 1 for a word it misses.
    const words = trimmed.split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w));
    const perWord = words.map(scores);

    return items
      .map((item) => {
        const wordScore = words.length
          ? perWord.reduce((sum, m) => sum + (m.get(item) ?? 1), 0) / words.length
          : 1;
        return { item, score: Math.min(whole.get(item) ?? 1, wordScore) };
      })
      .filter((r) => r.score <= MAX_SCORE)
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  };
}
```

- [ ] **Step 3: Replace `lib/search/search.ts` with a thin wrapper**

```ts
import { allTools, type ToolConfig } from "@/registry";
import { createFuzzySearch } from "./fuzzy";

export interface SearchResult {
  tool: ToolConfig;
  /** 0 = perfect match, 1 = no match. */
  score: number;
}

export function createSearch(tools: ToolConfig[]) {
  const fuzzy = createFuzzySearch(tools, [
    { name: "title", weight: 3 },
    { name: "keywords", weight: 2 },
    { name: "description", weight: 1 },
  ]);
  return (query: string, limit = 8): SearchResult[] => fuzzy(query, limit).map(({ item, score }) => ({ tool: item, score }));
}

/** Ranked matches across the full tool registry. */
export const search = createSearch(allTools);
```

- [ ] **Step 4: Run the search tests and type check**

Run: `npx vitest run lib/search && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/search/fuzzy.ts lib/search/search.ts
git commit -m "refactor(search): extract generic fuzzy ranking"
```

---

### Task 2: Types, shell quoting and validators

**Files:**
- Create: `lib/tools/developer/git/types.ts`, `lib/tools/developer/git/quote.ts`, `lib/tools/developer/git/ref-name.ts`
- Test: `lib/tools/developer/git/quote.test.ts`, `lib/tools/developer/git/ref-name.test.ts`

**Interfaces:**
- Produces (types.ts): `Danger`, `GitCategoryId`, `FieldValue = string | boolean`, `FieldValues`, `Field`, `Args`, `Part`, `Step`, `Task`, exactly as below.
- Produces (quote.ts): `quote(arg: string): string`, `escapeEre(text: string): string`.
- Produces (ref-name.ts): `refNameError`, `revisionError`, `pathError`, `pathsError`, `urlError` and `singleLineError`, each `(value: string) => string | null`; plus `integerError(min: number): (value: string) => string | null`.

- [ ] **Step 1: Create `lib/tools/developer/git/types.ts`**

```ts
export type Danger = "safe" | "caution" | "destructive";

export type GitCategoryId =
  | "branches"
  | "commits"
  | "remote"
  | "undo"
  | "stash"
  | "merge-rebase"
  | "tags"
  | "inspect"
  | "cleanup";

/** Text, number and select fields hold strings; checkboxes hold booleans. */
export type FieldValue = string | boolean;
export type FieldValues = Record<string, FieldValue>;

export interface Field {
  id: string;
  label: string;
  help?: string;
  /** "text" is code-like (branch names, hashes), "prose" is a sentence (commit messages). */
  kind: "text" | "prose" | "number" | "select" | "checkbox";
  default: FieldValue;
  /** Shown in the empty input, and as <placeholder> in the command while the field is empty. Defaults to the id. */
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Text fields only. Required otherwise. */
  optional?: boolean;
  /** Gets the trimmed, non-empty value. */
  validate?: (value: string) => string | null;
  /** Hidden fields are neither validated nor required. */
  shownWhen?: (values: FieldValues) => boolean;
}

/** What a task's `build` reads its field values through. */
export interface Args {
  /** The value shell-quoted, or "<placeholder>" while a required field is empty. */
  q(id: string): string;
  /** The trimmed value unquoted, or "<placeholder>". For building a larger string that is quoted as a whole. */
  text(id: string): string;
  /** Whether the field has a value (a placeholder counts). */
  has(id: string): boolean;
  flag(id: string): boolean;
  /** A select's value. Options are fixed, so it's safe to insert unquoted. */
  choice(id: string): string;
  /** A space-separated list, each item quoted. */
  list(id: string): string[];
}

export interface Part {
  /** Already shell-quoted. */
  text: string;
  explain: string;
}

export interface Step {
  /** Joined with spaces to form the command. */
  parts: Part[];
  danger: Danger;
  /** Required for destructive steps. */
  warning?: string;
  saferAlternative?: { taskId: string; label: string };
}

export interface Task {
  /** Stable kebab-case id, used in the URL. */
  id: string;
  category: GitCategoryId;
  title: string;
  summary: string;
  /** Extra phrasings for search. */
  synonyms: string[];
  fields: Field[];
  build: (args: Args) => Step[];
  related?: string[];
}
```

- [ ] **Step 2: Write the failing quoting tests in `lib/tools/developer/git/quote.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { escapeEre, quote } from "./quote";

describe("quote", () => {
  it.each(["feature/user-profile", "HEAD~2", "origin/main", "v1.2.3", "git@github.com:me/app.git", "a,b", "50%"])(
    "leaves %s bare",
    (arg) => {
      expect(quote(arg)).toBe(arg);
    },
  );

  it.each([
    ["fix login", "'fix login'"],
    ["", "''"],
    ["-f", "'-f'"],
    ["~/repo", "'~/repo'"],
    ["src/*.ts", "'src/*.ts'"],
    ["$HOME", "'$HOME'"],
    ["{a,b}", "'{a,b}'"],
    ["=ls", "'=ls'"],
    ["a=~b", "'a=~b'"],
    ["HEAD^", "'HEAD^'"],
    ["café", "'café'"],
    ["a;rm -rf /", "'a;rm -rf /'"],
  ])("quotes %j as %s", (arg, expected) => {
    expect(quote(arg)).toBe(expected);
  });

  it("closes, escapes and reopens around single quotes", () => {
    expect(quote("don't")).toBe("'don'\\''t'");
  });
});

describe("escapeEre", () => {
  it("escapes regex metacharacters but not slashes", () => {
    expect(escapeEre("release-1.0")).toBe("release-1\\.0");
    expect(escapeEre("feature/a+b")).toBe("feature/a\\+b");
  });
});
```

- [ ] **Step 3: Run it and check it fails**

Run: `npx vitest run lib/tools/developer/git/quote.test.ts`
Expected: FAIL, cannot resolve `./quote`.

- [ ] **Step 4: Create `lib/tools/developer/git/quote.ts`**

```ts
// Characters with no special meaning to bash or zsh anywhere in a word. "-", "~" and "=" are left out of the first
// position (option, tilde expansion, zsh equals expansion); braces are left out entirely (brace expansion).
const BARE = /^[A-Za-z0-9_./:@%+,][A-Za-z0-9_./:@%+,=~-]*$/;

/** Quotes `arg` for a POSIX shell (bash, zsh) so it reaches the program as one literal argument. */
export function quote(arg: string): string {
  // zsh expands "~" after "=" or ":" inside a word when MAGIC_EQUAL_SUBST is set.
  if (BARE.test(arg) && !/[=:]~/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** Escapes `text` for a POSIX extended regex (grep -E). Leaves "/" alone: GNU grep warns about "\/". */
export function escapeEre(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 5: Run the quoting tests**

Run: `npx vitest run lib/tools/developer/git/quote.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing validator tests in `lib/tools/developer/git/ref-name.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { integerError, pathError, pathsError, refNameError, revisionError, singleLineError, urlError } from "./ref-name";

describe("refNameError", () => {
  it.each(["main", "feature/user-profile", "v1.2.0", "fix-123", "release/2026.10", "a'b"])("accepts %s", (name) => {
    expect(refNameError(name)).toBeNull();
  });

  it.each([
    ["my branch", "Can't contain spaces."],
    ["a\u0001b", "Can't contain control characters."],
    ["-f", "Can't start with -."],
    ["a~b", "Can't contain ~."],
    ["a^b", "Can't contain ^."],
    ["a:b", "Can't contain :."],
    ["a?b", "Can't contain ?."],
    ["a*b", "Can't contain *."],
    ["a[b", "Can't contain [."],
    ["a\\b", "Can't contain \\."],
    ["a..b", "Can't contain two dots in a row."],
    ["a@{b", "Can't contain @{."],
    ["@", "Can't be just @."],
    ["/a", "Can't start or end with /."],
    ["a/", "Can't start or end with /."],
    ["a//b", "Can't contain //."],
    [".hidden", "No part between slashes can start with a dot."],
    ["feature/.x", "No part between slashes can start with a dot."],
    ["a.lock", "Can't end with .lock."],
    ["a.", "Can't end with a dot."],
  ])("rejects %j: %s", (name, message) => {
    expect(refNameError(name)).toBe(message);
  });
});

describe("revisionError", () => {
  it("accepts hashes, refs and relative revisions", () => {
    for (const rev of ["a1b2c3d", "HEAD~2", "origin/main", "v1.0.0", "HEAD^"]) expect(revisionError(rev)).toBeNull();
  });
  it("rejects spaces and a leading dash", () => {
    expect(revisionError("a b")).toBe("Can't contain spaces.");
    expect(revisionError("--all")).toBe("Can't start with -.");
  });
});

describe("path validators", () => {
  it("allow spaces in a single path but not a leading dash", () => {
    expect(pathError("docs/My Notes.md")).toBeNull();
    expect(pathError("-rf")).toBe("Can't start with -.");
  });
  it("check every path in a list", () => {
    expect(pathsError("src/a.ts src/*.ts")).toBeNull();
    expect(pathsError("src/a.ts -rf")).toBe("Paths can't start with -.");
  });
});

describe("integerError", () => {
  it("accepts whole numbers at or above the minimum", () => {
    expect(integerError(1)("1")).toBeNull();
    expect(integerError(0)("0")).toBeNull();
    expect(integerError(2)("10")).toBeNull();
  });
  it.each(["0", "1.5", "abc", "-1"])("rejects %j for a minimum of 1", (value) => {
    expect(integerError(1)(value)).toBe("Enter a whole number, 1 or more.");
  });
});

describe("other validators", () => {
  it("check URLs and single lines", () => {
    expect(urlError("git@github.com:me/app.git")).toBeNull();
    expect(urlError("https://x.com/a b")).toBe("Can't contain spaces.");
    expect(urlError("-u")).toBe("Can't start with -.");
    expect(singleLineError("Fix login")).toBeNull();
    expect(singleLineError("a\nb")).toBe("Must be a single line.");
  });
});
```

- [ ] **Step 7: Run it and check it fails**

Run: `npx vitest run lib/tools/developer/git/ref-name.test.ts`
Expected: FAIL, cannot resolve `./ref-name`.

- [ ] **Step 8: Create `lib/tools/developer/git/ref-name.ts`**

```ts
// Field validators. Each gets a trimmed, non-empty value and returns a message, or null when it's valid.

const isControl = (ch: string) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127;

/** Branch and tag names, following `git check-ref-format`. A leading "-" is refused too, or Git reads an option. */
export function refNameError(name: string): string | null {
  if (/\s/.test(name)) return "Can't contain spaces.";
  if ([...name].some(isControl)) return "Can't contain control characters.";
  if (name.startsWith("-")) return "Can't start with -.";
  const bad = name.match(/[~^:?*[\\]/);
  if (bad) return `Can't contain ${bad[0]}.`;
  if (name.includes("..")) return "Can't contain two dots in a row.";
  if (name.includes("@{")) return "Can't contain @{.";
  if (name === "@") return "Can't be just @.";
  if (name.startsWith("/") || name.endsWith("/")) return "Can't start or end with /.";
  if (name.includes("//")) return "Can't contain //.";
  if (name.split("/").some((part) => part.startsWith("."))) return "No part between slashes can start with a dot.";
  if (name.endsWith(".lock")) return "Can't end with .lock.";
  if (name.endsWith(".")) return "Can't end with a dot.";
  return null;
}

/** Anything Git resolves to a commit: a hash, branch, tag, HEAD~2, origin/main. */
export function revisionError(rev: string): string | null {
  if (/\s/.test(rev)) return "Can't contain spaces.";
  if (rev.startsWith("-")) return "Can't start with -.";
  return null;
}

export function pathError(path: string): string | null {
  return path.startsWith("-") ? "Can't start with -." : null;
}

/** A space-separated list of paths. */
export function pathsError(paths: string): string | null {
  return paths.split(/\s+/).some((path) => path.startsWith("-")) ? "Paths can't start with -." : null;
}

export function integerError(min: number) {
  return (value: string): string | null =>
    /^\d+$/.test(value) && Number(value) >= min ? null : `Enter a whole number, ${min} or more.`;
}

export function urlError(url: string): string | null {
  if (/\s/.test(url)) return "Can't contain spaces.";
  if (url.startsWith("-")) return "Can't start with -.";
  return null;
}

export function singleLineError(text: string): string | null {
  return /[\r\n]/.test(text) ? "Must be a single line." : null;
}
```

- [ ] **Step 9: Run both test files and type check**

Run: `npx vitest run lib/tools/developer/git && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/tools/developer/git
git commit -m "feat(git): types, shell quoting and field validators"
```

---

### Task 3: Resolver and catalog helpers

**Files:**
- Create: `lib/tools/developer/git/build.ts`, `lib/tools/developer/git/catalog/helpers.ts`
- Test: `lib/tools/developer/git/build.test.ts`

**Interfaces:**
- Consumes: types from Task 2; `quote`, `escapeEre` and the validators.
- Produces (build.ts):
  - `placeholderToken(field: Field): string` → `"<placeholder>"`
  - `defaultValues(task: Task): FieldValues`
  - `visibleFields(task: Task, values: FieldValues): Field[]`
  - `type Resolved = { status: "invalid"; errors: Record<string, string> } | { status: "incomplete"; missing: Field[]; steps: Step[] } | { status: "ready"; steps: Step[] }`
  - `resolveTask(task: Task, values: FieldValues): Resolved`
  - `stepCommand(step: Step): string`, `commandText(steps: Step[]): string` (steps joined with `\n`)
  - `highestDanger(steps: Step[]): Danger`, `fieldCombinations(task: Task): FieldValues[]`, `maxDanger(task: Task): Danger`
- Produces (catalog/helpers.ts):
  - `part`, `when`, `step`, `REWRITE_WARNING`
  - `refField`, `revisionField`, `remoteField`, `countField`, `stashField`, `pathField`, `pathsField`, `messageField`, `urlField`
  - `subjectPart`, `bodyParts`, `pathsPart`, `backPart`, `stashRef`
  - signatures as in the code below

- [ ] **Step 1: Create `lib/tools/developer/git/catalog/helpers.ts`**

```ts
import { integerError, pathError, pathsError, refNameError, revisionError, singleLineError, urlError } from "../ref-name";
import type { Args, Danger, Field, Part, Step } from "../types";

export const part = (text: string, explain: string): Part => ({ text, explain });

/** `parts` when `condition` holds, else none: for spreading optional parts into a step. */
export const when = (condition: boolean, ...parts: Part[]): Part[] => (condition ? parts : []);

export function step(danger: Danger, parts: Part[], extra: Pick<Step, "warning" | "saferAlternative"> = {}): Step {
  return { parts, danger, ...extra };
}

export const REWRITE_WARNING =
  "Rewrites commits. If they were already pushed, you'll need a force push, and anyone who pulled them has to reset to the new version.";

export const refField = (id: string, label: string, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  kind: "text",
  default: "",
  placeholder: id,
  validate: refNameError,
  ...extra,
});

export const revisionField = (id: string, label: string, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  kind: "text",
  default: "",
  placeholder: "commit",
  help: "A commit hash, branch, tag, or something like HEAD~2.",
  validate: revisionError,
  ...extra,
});

export const remoteField = (extra: Partial<Field> = {}): Field =>
  refField("remote", "Remote", { default: "origin", ...extra });

export const countField = (label: string, min = 1, extra: Partial<Field> = {}): Field => ({
  id: "count",
  label,
  kind: "number",
  default: String(min),
  placeholder: "n",
  validate: integerError(min),
  ...extra,
});

export const stashField = (): Field => ({
  id: "index",
  label: "Stash number",
  kind: "number",
  default: "0",
  placeholder: "n",
  help: "0 is the newest. List your stashes to see the others.",
  validate: integerError(0),
});

export const pathField = (id: string, label: string): Field => ({
  id,
  label,
  kind: "text",
  default: "",
  placeholder: "path",
  validate: pathError,
});

export const pathsField = (extra: Partial<Field> = {}): Field => ({
  id: "paths",
  label: "Files",
  kind: "text",
  default: "",
  optional: true,
  placeholder: "paths",
  help: "Separate paths with spaces. Leave empty for all files.",
  validate: pathsError,
  ...extra,
});

export const messageField = (id = "subject", label = "Commit message", extra: Partial<Field> = {}): Field => ({
  id,
  label,
  kind: "prose",
  default: "",
  placeholder: "message",
  validate: singleLineError,
  ...extra,
});

export const urlField = (): Field => ({
  id: "url",
  label: "URL",
  kind: "text",
  default: "",
  placeholder: "url",
  help: "HTTPS or SSH, like git@github.com:you/repo.git.",
  validate: urlError,
});

export const subjectPart = (a: Args): Part => part(`-m ${a.q("subject")}`, "The commit message.");

/** A second -m, when the optional "body" field is filled. */
export const bodyParts = (a: Args): Part[] =>
  when(a.has("body"), part(`-m ${a.q("body")}`, "A second -m adds a paragraph: the commit's body."));

/** The "paths" field's files, or "." for all of them. */
export const pathsPart = (a: Args, explain: string): Part =>
  a.has("paths") ? part(a.list("paths").join(" "), explain) : part(".", "Every file in the current folder and below.");

/** HEAD~n for the "count" field. */
export const backPart = (a: Args): Part =>
  part(`HEAD~${a.q("count")}`, "The commit that many steps before the current one.");

/** stash@{n} for the "index" field. */
export const stashRef = (a: Args): Part => part(`stash@{${a.q("index")}}`, "Which stash: 0 is the newest.");
```

- [ ] **Step 2: Write the failing resolver tests in `lib/tools/developer/git/build.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  commandText,
  defaultValues,
  fieldCombinations,
  highestDanger,
  maxDanger,
  placeholderToken,
  resolveTask,
} from "./build";
import { part, refField, revisionField, step, when } from "./catalog/helpers";
import type { FieldValues, Task } from "./types";

const fixture: Task = {
  id: "fixture",
  category: "branches",
  title: "Fixture",
  summary: "For tests.",
  synonyms: [],
  fields: [
    refField("name", "Name", { placeholder: "branch-name" }),
    revisionField("start", "Start", { optional: true }),
    { id: "force", label: "Force", kind: "checkbox", default: false },
    {
      id: "mode",
      label: "Mode",
      kind: "select",
      default: "a",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
    revisionField("extra", "Extra", { placeholder: "extra", shownWhen: (v) => v.mode === "b" }),
  ],
  build: (a) => [
    step(
      a.flag("force") ? "destructive" : "safe",
      [
        part("git x", "X."),
        part(a.q("name"), "Name."),
        ...when(a.has("start"), part(a.q("start"), "Start.")),
        ...when(a.choice("mode") === "b", part(a.q("extra"), "Extra.")),
      ],
      a.flag("force") ? { warning: "W." } : {},
    ),
  ],
};

const resolve = (values: FieldValues) => resolveTask(fixture, { ...defaultValues(fixture), ...values });

describe("resolveTask", () => {
  it("builds the command when every required field is valid", () => {
    const r = resolve({ name: "feature/a" });
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(commandText(r.steps)).toBe("git x feature/a");
  });

  it("trims pasted whitespace", () => {
    const r = resolve({ name: "  feature/a  ", start: " main " });
    expect(r.status === "ready" && commandText(r.steps)).toBe("git x feature/a main");
  });

  it("quotes values", () => {
    const r = resolve({ name: "a'b" });
    expect(r.status === "ready" && commandText(r.steps)).toBe("git x 'a'\\''b'");
  });

  it("shows placeholders for empty required fields", () => {
    const r = resolve({});
    expect(r.status).toBe("incomplete");
    if (r.status !== "incomplete") return;
    expect(r.missing.map((f) => f.id)).toEqual(["name"]);
    expect(commandText(r.steps)).toBe("git x <branch-name>");
  });

  it("reports invalid values, including a leading dash", () => {
    expect(resolve({ name: "-f" })).toEqual({ status: "invalid", errors: { name: "Can't start with -." } });
    expect(resolve({ name: "a b", start: "x y" })).toEqual({
      status: "invalid",
      errors: { name: "Can't contain spaces.", start: "Can't contain spaces." },
    });
  });

  it("ignores hidden fields", () => {
    expect(resolve({ name: "x", extra: "a b" }).status).toBe("ready");
    const r = resolve({ name: "x", mode: "b" });
    expect(r.status === "incomplete" && r.missing.map((f) => f.id)).toEqual(["extra"]);
  });
});

describe("danger", () => {
  it("is the highest of the steps, safe for none", () => {
    expect(highestDanger([])).toBe("safe");
    expect(highestDanger([step("safe", []), step("caution", [])])).toBe("caution");
  });

  it("covers every checkbox and select combination", () => {
    expect(fieldCombinations(fixture)).toHaveLength(4);
    expect(maxDanger(fixture)).toBe("destructive");
  });
});

describe("placeholderToken", () => {
  it("falls back to the field id", () => {
    expect(placeholderToken({ id: "name", label: "Name", kind: "text", default: "" })).toBe("<name>");
  });
});
```

- [ ] **Step 3: Run it and check it fails**

Run: `npx vitest run lib/tools/developer/git/build.test.ts`
Expected: FAIL, cannot resolve `./build`.

- [ ] **Step 4: Create `lib/tools/developer/git/build.ts`**

```ts
import { quote } from "./quote";
import type { Args, Danger, Field, FieldValues, Step, Task } from "./types";

export type Resolved =
  | { status: "invalid"; errors: Record<string, string> }
  /** Steps are built with <placeholder> text for the missing fields, so the command's shape still shows. */
  | { status: "incomplete"; missing: Field[]; steps: Step[] }
  | { status: "ready"; steps: Step[] };

export const placeholderToken = (field: Field): string => `<${field.placeholder ?? field.id}>`;

export function defaultValues(task: Task): FieldValues {
  return Object.fromEntries(task.fields.map((field) => [field.id, field.default]));
}

export function visibleFields(task: Task, values: FieldValues): Field[] {
  return task.fields.filter((field) => !field.shownWhen || field.shownWhen(values));
}

const isTyped = (field: Field) => field.kind !== "checkbox" && field.kind !== "select";

function trimmed(values: FieldValues, id: string): string {
  const value = values[id];
  return typeof value === "string" ? value.trim() : "";
}

function makeArgs(task: Task, values: FieldValues, missing: Set<string>): Args {
  function field(id: string): Field {
    const found = task.fields.find((f) => f.id === id);
    if (!found) throw new Error(`Task "${task.id}" has no field "${id}".`);
    return found;
  }
  const token = (id: string) => (missing.has(id) ? placeholderToken(field(id)) : null);

  return {
    q: (id) => token(id) ?? quote(trimmed(values, id)),
    text: (id) => token(id) ?? trimmed(values, id),
    has: (id) => token(id) !== null || trimmed(values, id) !== "",
    flag: (id) => {
      field(id);
      return values[id] === true;
    },
    choice: (id) => String(values[id] ?? field(id).default),
    list: (id) => {
      const placeholder = token(id);
      return placeholder ? [placeholder] : trimmed(values, id).split(/\s+/).filter(Boolean).map(quote);
    },
  };
}

export function resolveTask(task: Task, values: FieldValues): Resolved {
  const errors: Record<string, string> = {};
  const missing = new Set<string>();

  for (const field of visibleFields(task, values)) {
    if (!isTyped(field)) continue;
    const value = trimmed(values, field.id);
    if (value === "") {
      if (!field.optional) missing.add(field.id);
      continue;
    }
    const error = field.validate?.(value);
    if (error) errors[field.id] = error;
  }

  if (Object.keys(errors).length > 0) return { status: "invalid", errors };
  const steps = task.build(makeArgs(task, values, missing));
  if (missing.size > 0) return { status: "incomplete", missing: task.fields.filter((f) => missing.has(f.id)), steps };
  return { status: "ready", steps };
}

export const stepCommand = (step: Step): string => step.parts.map((p) => p.text).join(" ");

export const commandText = (steps: Step[]): string => steps.map(stepCommand).join("\n");

const RANK: Record<Danger, number> = { safe: 0, caution: 1, destructive: 2 };

export function highestDanger(steps: Step[]): Danger {
  return steps.reduce<Danger>((worst, s) => (RANK[s.danger] > RANK[worst] ? s.danger : worst), "safe");
}

/** The task's defaults with every combination of its checkbox and select values. */
export function fieldCombinations(task: Task): FieldValues[] {
  let combos: FieldValues[] = [defaultValues(task)];
  for (const field of task.fields) {
    const options =
      field.kind === "checkbox" ? [false, true] : field.kind === "select" ? (field.options ?? []).map((o) => o.value) : null;
    if (!options) continue;
    combos = combos.flatMap((combo) => options.map((option) => ({ ...combo, [field.id]: option })));
  }
  return combos;
}

/** The most dangerous the task can get, whatever its options: for the badge in the task list. */
export function maxDanger(task: Task): Danger {
  const allTyped = new Set(task.fields.filter(isTyped).map((f) => f.id));
  return highestDanger(fieldCombinations(task).flatMap((values) => task.build(makeArgs(task, values, allTyped))));
}
```

- [ ] **Step 5: Run the tests and type check**

Run: `npx vitest run lib/tools/developer/git && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/tools/developer/git
git commit -m "feat(git): task resolver with placeholders, validation and danger"
```

---

### Task 4: Catalog index, branch and commit tasks

**Files:**
- Create: `lib/tools/developer/git/catalog/index.ts`, `catalog/test-helpers.ts`, `catalog/branches.ts`, `catalog/commits.ts`
- Test: `catalog/branches.test.ts`, `catalog/commits.test.ts`

**Interfaces:**
- Consumes: helpers and `build.ts` from Task 3.
- Produces (index.ts): `GIT_CATEGORIES: { id: GitCategoryId; label: string }[]`, `TASKS: Task[]` (in `GIT_CATEGORIES` order), `getTask(id: string): Task | undefined`, `QUICK_START: string[]`.
- Produces (test-helpers.ts): `resolve(taskId, values?) → Resolved`, `command(taskId, values?) → string`, `danger(taskId, values?) → Danger`. `command` and `danger` throw unless the result is ready.

- [ ] **Step 1: Create `catalog/test-helpers.ts`**

```ts
import { commandText, defaultValues, highestDanger, resolveTask, type Resolved } from "../build";
import type { Danger, FieldValues, Step } from "../types";
import { getTask } from ".";

export function resolve(taskId: string, values: FieldValues = {}): Resolved {
  const task = getTask(taskId);
  if (!task) throw new Error(`No task "${taskId}".`);
  return resolveTask(task, { ...defaultValues(task), ...values });
}

function readySteps(taskId: string, values: FieldValues): Step[] {
  const r = resolve(taskId, values);
  if (r.status === "invalid") throw new Error(`"${taskId}" is invalid: ${JSON.stringify(r.errors)}`);
  if (r.status === "incomplete") throw new Error(`"${taskId}" is missing ${r.missing.map((f) => f.id).join(", ")}`);
  return r.steps;
}

export const command = (taskId: string, values: FieldValues = {}): string => commandText(readySteps(taskId, values));

export const danger = (taskId: string, values: FieldValues = {}): Danger => highestDanger(readySteps(taskId, values));
```

- [ ] **Step 2: Write the failing tests in `catalog/branches.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("branch tasks", () => {
  it("creates a branch, optionally from a start point", () => {
    expect(command("create-branch", { name: "feature/user-profile" })).toBe("git switch -c feature/user-profile");
    expect(command("create-branch", { name: "feature/user-profile", start: "origin/main" })).toBe(
      "git switch -c feature/user-profile origin/main",
    );
  });

  it("switches to local and remote branches", () => {
    expect(command("switch-branch", { name: "main" })).toBe("git switch main");
    expect(command("checkout-remote-branch", { branch: "feature/login" })).toBe("git switch --track origin/feature/login");
  });

  it("renames the current or a named branch", () => {
    expect(command("rename-branch", { new: "feature/new" })).toBe("git branch -m feature/new");
    expect(command("rename-branch", { old: "old", new: "new" })).toBe("git branch -m old new");
  });

  it("renames on the remote in three steps", () => {
    expect(command("rename-branch-remote", { old: "old", new: "new" })).toBe(
      ["git branch -m old new", "git push -u origin new", "git push origin --delete old"].join("\n"),
    );
    expect(danger("rename-branch-remote", { old: "old", new: "new" })).toBe("caution");
  });

  it("deletes safely unless forced", () => {
    expect(command("delete-branch", { name: "old" })).toBe("git branch -d old");
    expect(danger("delete-branch", { name: "old" })).toBe("safe");
    expect(command("delete-branch", { name: "old", force: true })).toBe("git branch -D old");
    expect(danger("delete-branch", { name: "old", force: true })).toBe("destructive");
    expect(command("delete-remote-branch", { branch: "old" })).toBe("git push origin --delete old");
  });

  it("lists branches by scope", () => {
    expect(command("list-branches")).toBe("git branch");
    expect(command("list-branches", { scope: "remote" })).toBe("git branch -r");
    expect(command("list-branches", { scope: "all", verbose: true })).toBe("git branch -a -vv");
  });

  it("adds a worktree for an existing or a new branch", () => {
    expect(command("add-worktree", { path: "../hotfix", branch: "hotfix" })).toBe("git worktree add ../hotfix hotfix");
    expect(command("add-worktree", { path: "../hotfix", branch: "hotfix", create: true })).toBe(
      "git worktree add -b hotfix ../hotfix",
    );
  });
});
```

- [ ] **Step 3: Write the failing tests in `catalog/commits.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { command, danger, resolve } from "./test-helpers";

describe("commit tasks", () => {
  it("commits with a subject and optional body", () => {
    expect(command("commit-staged", { subject: "Add login form" })).toBe("git commit -m 'Add login form'");
    expect(command("commit-staged", { subject: "Fix crash", body: "Null check on user." })).toBe(
      "git commit -m 'Fix crash' -m 'Null check on user.'",
    );
  });

  it("passes shell metacharacters through literally", () => {
    expect(command("commit-staged", { subject: "don't expand $HOME or `ls`" })).toBe(
      "git commit -m 'don'\\''t expand $HOME or `ls`'",
    );
  });

  it("stages everything before committing", () => {
    expect(command("commit-all", { subject: "Add login form" })).toBe("git add -A\ngit commit -m 'Add login form'");
  });

  it("amends the last commit", () => {
    expect(command("amend-message", { subject: "Fix typo" })).toBe("git commit --amend -m 'Fix typo'");
    expect(danger("amend-message", { subject: "Fix typo" })).toBe("caution");
    expect(command("amend-add-files")).toBe("git add .\ngit commit --amend --no-edit");
    expect(command("amend-add-files", { paths: "a.ts b.ts" })).toBe("git add a.ts b.ts\ngit commit --amend --no-edit");
  });

  it("squashes at least two commits", () => {
    expect(command("squash-last-n", { subject: "Add search" })).toBe("git reset --soft HEAD~2\ngit commit -m 'Add search'");
    expect(resolve("squash-last-n", { subject: "Add search", count: "1" })).toEqual({
      status: "invalid",
      errors: { count: "Enter a whole number, 2 or more." },
    });
  });

  it("rebases, fixes up, cherry-picks and makes empty commits", () => {
    expect(command("interactive-rebase")).toBe("git rebase -i HEAD~3");
    expect(command("fixup-commit", { target: "abc1234" })).toBe(
      "git commit --fixup=abc1234\ngit rebase -i --autosquash abc1234~1",
    );
    expect(command("cherry-pick", { commit: "abc1234" })).toBe("git cherry-pick abc1234");
    expect(command("empty-commit", { subject: "Trigger CI" })).toBe("git commit --allow-empty -m 'Trigger CI'");
  });
});
```

- [ ] **Step 4: Run them and check they fail**

Run: `npx vitest run lib/tools/developer/git/catalog`
Expected: FAIL, cannot resolve `.` (index) or the category modules.

- [ ] **Step 5: Create `catalog/branches.ts`**

```ts
import type { Task } from "../types";
import { part, pathField, refField, remoteField, revisionField, step, when } from "./helpers";

export const branchTasks: Task[] = [
  {
    id: "create-branch",
    category: "branches",
    title: "Create a new branch",
    summary: "Creates a branch and switches to it.",
    synonyms: ["new branch", "make a branch", "checkout -b", "start a feature branch", "branch off"],
    fields: [
      refField("name", "Branch name", { placeholder: "branch-name" }),
      revisionField("start", "Start from", {
        optional: true,
        placeholder: "start-point",
        help: "A branch, tag or commit. Leave empty to start from the current commit.",
      }),
    ],
    build: (a) => [
      step("safe", [
        part("git switch -c", "Create a branch and switch to it."),
        part(a.q("name"), "The new branch's name."),
        ...when(a.has("start"), part(a.q("start"), "The commit the branch starts from.")),
      ]),
    ],
  },
  {
    id: "switch-branch",
    category: "branches",
    title: "Switch to a branch",
    summary: "Changes your working tree to another existing branch.",
    synonyms: ["checkout branch", "change branch", "go to branch", "git checkout"],
    fields: [refField("name", "Branch", { placeholder: "branch" })],
    build: (a) => [
      step("safe", [part("git switch", "Switch to an existing branch."), part(a.q("name"), "The branch to switch to.")]),
    ],
  },
  {
    id: "checkout-remote-branch",
    category: "branches",
    title: "Check out a branch from the remote",
    summary: "Creates a local branch that tracks a remote one, and switches to it.",
    synonyms: ["checkout remote branch", "track remote branch", "get branch from origin", "work on a colleague's branch"],
    fields: [remoteField(), refField("branch", "Remote branch", { placeholder: "branch" })],
    build: (a) => [
      step("safe", [
        part("git switch --track", "Create a local branch that tracks a remote branch, and switch to it."),
        part(`${a.q("remote")}/${a.q("branch")}`, "The remote branch. The local one gets the same name."),
      ]),
    ],
    related: ["fetch"],
  },
  {
    id: "rename-branch",
    category: "branches",
    title: "Rename a branch",
    summary: "Renames a local branch.",
    synonyms: ["change branch name", "move branch", "branch -m"],
    fields: [
      refField("old", "Current name", {
        optional: true,
        placeholder: "old-name",
        help: "Leave empty to rename the branch you're on.",
      }),
      refField("new", "New name", { placeholder: "new-name" }),
    ],
    build: (a) => [
      step("safe", [
        part("git branch -m", "Rename (move) a branch."),
        ...when(a.has("old"), part(a.q("old"), "The branch to rename.")),
        part(a.q("new"), "Its new name."),
      ]),
    ],
    related: ["rename-branch-remote"],
  },
  {
    id: "rename-branch-remote",
    category: "branches",
    title: "Rename a branch on the remote too",
    summary: "Renames a branch locally, pushes it under the new name and deletes the old name from the remote.",
    synonyms: ["rename remote branch", "rename pushed branch", "change branch name on github"],
    fields: [
      refField("old", "Current name", { placeholder: "old-name" }),
      refField("new", "New name", { placeholder: "new-name" }),
      remoteField(),
    ],
    build: (a) => [
      step("safe", [part("git branch -m", "Rename the local branch."), part(a.q("old"), "Its current name."), part(a.q("new"), "Its new name.")]),
      step("safe", [
        part("git push -u", "Push, and make the local branch track what you push."),
        part(a.q("remote"), "The remote to push to."),
        part(a.q("new"), "The branch, under its new name."),
      ]),
      step(
        "caution",
        [part("git push", "Send a change to the remote."), part(a.q("remote"), "The remote."), part("--delete", "Delete a branch there."), part(a.q("old"), "The old name.")],
        { warning: "Anyone who has the old branch checked out has to switch to the new name." },
      ),
    ],
  },
  {
    id: "delete-branch",
    category: "branches",
    title: "Delete a local branch",
    summary: "Deletes a branch from your machine. The remote is untouched.",
    synonyms: ["remove branch", "branch -d", "branch -D", "force delete branch"],
    fields: [
      refField("name", "Branch", { placeholder: "branch", help: "You can't delete the branch you're on." }),
      { id: "force", label: "Force: delete even if it isn't merged", kind: "checkbox", default: false },
    ],
    build: (a) => [
      a.flag("force")
        ? step(
            "destructive",
            [part("git branch -D", "Delete the branch even if its commits aren't merged anywhere."), part(a.q("name"), "The branch to delete.")],
            { warning: "Commits that are only on this branch stop being reachable. You can get them back from the reflog for a while." },
          )
        : step("safe", [
            part("git branch -d", "Delete the branch. Git refuses if it has commits that aren't merged."),
            part(a.q("name"), "The branch to delete."),
          ]),
    ],
    related: ["delete-remote-branch", "recover-lost-commit"],
  },
  {
    id: "delete-remote-branch",
    category: "branches",
    title: "Delete a branch on the remote",
    summary: "Removes a branch from the remote repository.",
    synonyms: ["remove remote branch", "delete branch on github", "push --delete"],
    fields: [remoteField(), refField("branch", "Branch", { placeholder: "branch" })],
    build: (a) => [
      step(
        "caution",
        [part("git push", "Send a change to the remote."), part(a.q("remote"), "The remote."), part("--delete", "Delete a branch there."), part(a.q("branch"), "The branch to delete.")],
        { warning: "Removes the branch for everyone who uses this remote." },
      ),
    ],
    related: ["delete-branch"],
  },
  {
    id: "list-branches",
    category: "branches",
    title: "List branches",
    summary: "Shows your branches, with the current one marked by *.",
    synonyms: ["show branches", "see all branches", "which branch am i on", "remote branches"],
    fields: [
      {
        id: "scope",
        label: "Which branches",
        kind: "select",
        default: "local",
        options: [
          { value: "local", label: "Local" },
          { value: "remote", label: "Remote-tracking" },
          { value: "all", label: "All" },
        ],
      },
      { id: "verbose", label: "Show last commit and upstream", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step("safe", [
        part("git branch", "List branches."),
        ...when(a.choice("scope") === "remote", part("-r", "Only remote-tracking branches, like origin/main.")),
        ...when(a.choice("scope") === "all", part("-a", "Local and remote-tracking branches.")),
        ...when(a.flag("verbose"), part("-vv", "Show each branch's last commit and the upstream it tracks.")),
      ]),
    ],
  },
  {
    id: "add-worktree",
    category: "branches",
    title: "Work on a branch in a second folder",
    summary: "Checks out a branch in another folder, so you can work on two branches at once without stashing.",
    synonyms: ["worktree", "git worktree add", "two branches at once", "parallel checkout"],
    fields: [
      { ...pathField("path", "Folder"), help: "Usually next to this repository, like ../hotfix." },
      refField("branch", "Branch", { placeholder: "branch" }),
      { id: "create", label: "Create the branch", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step(
        "safe",
        a.flag("create")
          ? [
              part("git worktree add", "Check out a branch in a new folder alongside this one."),
              part("-b", "Create the branch first."),
              part(a.q("branch"), "The new branch's name."),
              part(a.q("path"), "The folder to create."),
            ]
          : [
              part("git worktree add", "Check out a branch in a new folder alongside this one."),
              part(a.q("path"), "The folder to create."),
              part(a.q("branch"), "The existing branch to check out there."),
            ],
      ),
    ],
  },
];
```

- [ ] **Step 6: Create `catalog/commits.ts`**

```ts
import type { Task } from "../types";
import { backPart, bodyParts, countField, messageField, part, pathsField, pathsPart, REWRITE_WARNING, revisionField, step, subjectPart } from "./helpers";

const bodyField = messageField("body", "Description", {
  optional: true,
  placeholder: "description",
  help: "Optional. Becomes the commit's body.",
});

export const commitTasks: Task[] = [
  {
    id: "commit-staged",
    category: "commits",
    title: "Commit staged changes",
    summary: "Records what you've staged as a new commit.",
    synonyms: ["commit", "save changes", "git commit -m", "make a commit"],
    fields: [messageField(), bodyField],
    build: (a) => [step("safe", [part("git commit", "Record the staged changes as a new commit."), subjectPart(a), ...bodyParts(a)])],
  },
  {
    id: "commit-all",
    category: "commits",
    title: "Stage everything and commit",
    summary: "Stages every change, including new and deleted files, then commits.",
    synonyms: ["commit all changes", "add and commit", "git add all", "commit everything"],
    fields: [messageField(), bodyField],
    build: (a) => [
      step("safe", [part("git add -A", "Stage every change, including new and deleted files.")]),
      step("safe", [part("git commit", "Record the staged changes as a new commit."), subjectPart(a), ...bodyParts(a)]),
    ],
  },
  {
    id: "amend-message",
    category: "commits",
    title: "Change the last commit's message",
    summary: "Replaces the last commit's message. Its changes stay the same.",
    synonyms: ["edit commit message", "fix commit message", "reword commit", "typo in commit message", "amend"],
    fields: [messageField("subject", "New message")],
    build: (a) => [
      step("caution", [part("git commit --amend", "Replace the last commit with a new one."), subjectPart(a)], { warning: REWRITE_WARNING }),
    ],
    related: ["force-push"],
  },
  {
    id: "amend-add-files",
    category: "commits",
    title: "Add forgotten files to the last commit",
    summary: "Folds more changes into the last commit and keeps its message.",
    synonyms: ["forgot to add file", "amend no edit", "add to last commit", "update last commit"],
    fields: [pathsField()],
    build: (a) => [
      step("safe", [part("git add", "Stage changes."), pathsPart(a, "The files to add.")]),
      step(
        "caution",
        [part("git commit --amend", "Replace the last commit with one that includes the staged changes."), part("--no-edit", "Keep its message.")],
        { warning: REWRITE_WARNING },
      ),
    ],
    related: ["force-push"],
  },
  {
    id: "squash-last-n",
    category: "commits",
    title: "Squash the last commits into one",
    summary: "Combines the last few commits into a single commit with a new message.",
    synonyms: ["combine commits", "squash commits", "merge commits into one", "flatten commits"],
    fields: [countField("Commits to squash", 2), messageField()],
    build: (a) => [
      step("caution", [part("git reset --soft", "Move the branch back, keeping all the changes staged."), backPart(a)], { warning: REWRITE_WARNING }),
      step("safe", [part("git commit", "Commit the staged changes as one commit."), subjectPart(a)]),
    ],
    related: ["interactive-rebase"],
  },
  {
    id: "interactive-rebase",
    category: "commits",
    title: "Edit recent commits (interactive rebase)",
    summary: "Opens an editor to reorder, reword, squash or drop the last few commits.",
    synonyms: ["rebase -i", "reorder commits", "drop a commit", "edit old commit", "reword older commit"],
    fields: [countField("Commits to edit", 1, { default: "3" })],
    build: (a) => [
      step(
        "caution",
        [part("git rebase -i", "Open an editor listing the commits: reorder the lines, or change pick to reword, squash or drop."), backPart(a)],
        { warning: REWRITE_WARNING },
      ),
    ],
    related: ["abort-rebase", "continue-after-conflict"],
  },
  {
    id: "fixup-commit",
    category: "commits",
    title: "Fix an older commit",
    summary: "Commits the staged changes as a fix to an older commit, then folds it in with an autosquash rebase.",
    synonyms: ["fixup", "autosquash", "amend older commit", "change an old commit"],
    fields: [revisionField("target", "Commit to fix")],
    build: (a) => [
      step("safe", [part("git commit", "Commit the staged changes."), part(`--fixup=${a.q("target")}`, "Mark the commit as a fix for this one.")]),
      step(
        "caution",
        [
          part("git rebase -i --autosquash", "Rebase with each fix moved right after its commit and set to squash in. Save the editor to apply."),
          part(`${a.q("target")}~1`, "Start just before the commit being fixed."),
        ],
        { warning: REWRITE_WARNING },
      ),
    ],
  },
  {
    id: "cherry-pick",
    category: "commits",
    title: "Copy a commit to this branch (cherry-pick)",
    summary: "Applies the changes from one existing commit as a new commit on the current branch.",
    synonyms: ["cherry pick", "copy commit", "apply commit from another branch", "port a fix"],
    fields: [revisionField("commit", "Commit")],
    build: (a) => [step("safe", [part("git cherry-pick", "Apply a commit's changes as a new commit here."), part(a.q("commit"), "The commit to copy.")])],
    related: ["continue-after-conflict"],
  },
  {
    id: "empty-commit",
    category: "commits",
    title: "Make an empty commit",
    summary: "Creates a commit with no changes, for example to trigger CI.",
    synonyms: ["trigger ci", "allow empty", "retrigger build"],
    fields: [messageField()],
    build: (a) => [step("safe", [part("git commit --allow-empty", "Create a commit even though nothing changed."), subjectPart(a)])],
  },
];
```

- [ ] **Step 7: Create `catalog/index.ts`. Later tasks add their imports here.**

```ts
import type { GitCategoryId, Task } from "../types";
import { branchTasks } from "./branches";
import { commitTasks } from "./commits";

/** Display order for chips and list groups. TASKS follows the same order. */
export const GIT_CATEGORIES: { id: GitCategoryId; label: string }[] = [
  { id: "branches", label: "Branches" },
  { id: "commits", label: "Commits" },
  { id: "remote", label: "Remote" },
  { id: "undo", label: "Undo" },
  { id: "stash", label: "Stash" },
  { id: "merge-rebase", label: "Merge & Rebase" },
  { id: "tags", label: "Tags" },
  { id: "inspect", label: "Inspect" },
  { id: "cleanup", label: "Cleanup" },
];

export const TASKS: Task[] = [...branchTasks, ...commitTasks];

const tasksById = new Map(TASKS.map((task) => [task.id, task]));

export function getTask(id: string): Task | undefined {
  return tasksById.get(id);
}

/** Offered before a task is picked. */
export const QUICK_START = ["reset-soft", "create-branch", "stash-changes", "discard-file-changes"];
```

- [ ] **Step 8: Run the catalog tests and type check**

Run: `npx vitest run lib/tools/developer/git && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/tools/developer/git/catalog
git commit -m "feat(git): branch and commit tasks"
```

---

### Task 5: Remote and undo tasks

**Files:**
- Create: `catalog/remote.ts`, `catalog/undo.ts`
- Modify: `catalog/index.ts` (imports + `TASKS`)
- Test: `catalog/remote.test.ts`, `catalog/undo.test.ts`

**Interfaces:**
- Consumes: helpers (Task 3), test-helpers (Task 4).
- Produces: `remoteTasks: Task[]`, `undoTasks: Task[]`, with ids used later by `QUICK_START` and by `saferAlternative` (`stash-changes` arrives in Task 6, and the integrity test in Task 7 checks it resolves).

- [ ] **Step 1: Write the failing tests in `catalog/remote.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("remote tasks", () => {
  it("adds, changes and lists remotes", () => {
    expect(command("add-remote", { url: "git@github.com:me/app.git" })).toBe("git remote add origin git@github.com:me/app.git");
    expect(command("change-remote-url", { url: "https://github.com/me/app.git" })).toBe(
      "git remote set-url origin https://github.com/me/app.git",
    );
    expect(command("list-remotes")).toBe("git remote -v");
  });

  it("pushes, with upstream for new branches", () => {
    expect(command("push")).toBe("git push");
    expect(command("push-set-upstream", { branch: "feature/x" })).toBe("git push -u origin feature/x");
  });

  it("force pushes with a lease unless told otherwise", () => {
    expect(command("force-push", { branch: "feature/x" })).toBe("git push --force-with-lease origin feature/x");
    expect(danger("force-push", { branch: "feature/x" })).toBe("caution");
    expect(command("force-push", { branch: "feature/x", noLease: true })).toBe("git push --force origin feature/x");
    expect(danger("force-push", { branch: "feature/x", noLease: true })).toBe("destructive");
  });

  it("fetches from all remotes or one, optionally pruning", () => {
    expect(command("fetch")).toBe("git fetch --all");
    expect(command("fetch", { remote: "upstream", prune: true })).toBe("git fetch upstream --prune");
  });

  it("pulls and sets upstream", () => {
    expect(command("pull")).toBe("git pull");
    expect(command("pull", { rebase: true })).toBe("git pull --rebase");
    expect(command("set-upstream", { branch: "main" })).toBe("git branch --set-upstream-to=origin/main");
  });
});
```

- [ ] **Step 2: Write the failing tests in `catalog/undo.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { commandText } from "../build";
import { command, danger, resolve } from "./test-helpers";

describe("undo tasks", () => {
  it("unstages all files or the given ones, quoting globs", () => {
    expect(command("unstage-files")).toBe("git restore --staged .");
    expect(command("unstage-files", { paths: "src/app.ts README.md" })).toBe("git restore --staged src/app.ts README.md");
    expect(command("unstage-files", { paths: "src/*.ts" })).toBe("git restore --staged 'src/*.ts'");
  });

  it("discards file changes destructively", () => {
    expect(command("discard-file-changes")).toBe("git restore .");
    expect(danger("discard-file-changes")).toBe("destructive");
  });

  it("resets soft, mixed and hard", () => {
    expect(command("reset-soft")).toBe("git reset --soft HEAD~1");
    expect(command("reset-soft", { count: "3" })).toBe("git reset --soft HEAD~3");
    expect(danger("reset-soft")).toBe("caution");
    expect(command("reset-mixed")).toBe("git reset HEAD~1");
    expect(command("reset-hard")).toBe("git reset --hard HEAD~1");
    expect(danger("reset-hard")).toBe("destructive");
  });

  it("shows a placeholder when the count is cleared", () => {
    const r = resolve("reset-soft", { count: "" });
    expect(r.status).toBe("incomplete");
    if (r.status === "incomplete") expect(commandText(r.steps)).toBe("git reset --soft HEAD~<n>");
  });

  it("reverts, restores and recovers", () => {
    expect(command("revert-commit")).toBe("git revert HEAD");
    expect(command("restore-file-from-commit", { commit: "HEAD~2", path: "src/app.ts" })).toBe(
      "git restore --source=HEAD~2 src/app.ts",
    );
    expect(command("reset-to-remote")).toBe("git fetch origin\ngit reset --hard origin/main");
    expect(command("recover-lost-commit", { commit: "a1b2c3d", branch: "rescued" })).toBe(
      "git reflog\ngit switch -c rescued a1b2c3d",
    );
  });
});
```

- [ ] **Step 3: Run them and check they fail**

Run: `npx vitest run lib/tools/developer/git/catalog/remote.test.ts lib/tools/developer/git/catalog/undo.test.ts`
Expected: FAIL with `No task "add-remote".` and the like.

- [ ] **Step 4: Create `catalog/remote.ts`**

```ts
import type { Task } from "../types";
import { part, refField, remoteField, step, urlField, when } from "./helpers";

export const remoteTasks: Task[] = [
  {
    id: "add-remote",
    category: "remote",
    title: "Add a remote",
    summary: "Connects your repository to another one, like a new GitHub repo.",
    synonyms: ["connect to github", "add origin", "remote add", "link repository"],
    fields: [refField("name", "Name", { default: "origin", placeholder: "name" }), urlField()],
    build: (a) => [
      step("safe", [
        part("git remote add", "Register a remote under a short name."),
        part(a.q("name"), "The name you'll use for it."),
        part(a.q("url"), "Where the repository lives."),
      ]),
    ],
  },
  {
    id: "change-remote-url",
    category: "remote",
    title: "Change a remote's URL",
    summary: "Points an existing remote at a new address, for example after switching from HTTPS to SSH.",
    synonyms: ["set-url", "change origin url", "switch to ssh", "repository moved"],
    fields: [refField("name", "Remote", { default: "origin", placeholder: "name" }), urlField()],
    build: (a) => [
      step("safe", [
        part("git remote set-url", "Change the URL of an existing remote."),
        part(a.q("name"), "The remote."),
        part(a.q("url"), "Its new URL."),
      ]),
    ],
  },
  {
    id: "list-remotes",
    category: "remote",
    title: "List remotes",
    summary: "Shows each remote and its URLs.",
    synonyms: ["show remotes", "remote -v", "what is origin"],
    fields: [],
    build: () => [step("safe", [part("git remote", "List remotes."), part("-v", "Show their fetch and push URLs.")])],
  },
  {
    id: "push",
    category: "remote",
    title: "Push commits",
    summary: "Uploads the current branch's new commits to the branch it tracks.",
    synonyms: ["upload commits", "git push", "send to github"],
    fields: [],
    build: () => [step("safe", [part("git push", "Upload this branch's new commits to the branch it tracks.")])],
    related: ["push-set-upstream"],
  },
  {
    id: "push-set-upstream",
    category: "remote",
    title: "Push a new branch",
    summary: "Pushes a branch for the first time and makes it track the remote branch.",
    synonyms: ["set upstream", "push -u", "publish branch", "no upstream branch"],
    fields: [remoteField(), refField("branch", "Branch", { placeholder: "branch" })],
    build: (a) => [
      step("safe", [
        part("git push", "Upload commits."),
        part("-u", "Remember the remote branch as upstream, so plain git push and git pull work from now on."),
        part(a.q("remote"), "The remote."),
        part(a.q("branch"), "The branch to push."),
      ]),
    ],
  },
  {
    id: "force-push",
    category: "remote",
    title: "Force push",
    summary: "Overwrites the remote branch with your local one, for example after a rebase or amend.",
    synonyms: ["push --force", "force-with-lease", "overwrite remote branch", "push after rebase"],
    fields: [
      remoteField(),
      refField("branch", "Branch", { placeholder: "branch" }),
      { id: "noLease", label: "Skip the safety check (--force)", kind: "checkbox", default: false },
    ],
    build: (a) => {
      const target = [part(a.q("remote"), "The remote."), part(a.q("branch"), "The branch to overwrite.")];
      return [
        a.flag("noLease")
          ? step("destructive", [part("git push", "Upload commits."), part("--force", "Replace the remote branch with yours, whatever it contains."), ...target], {
              warning:
                "Overwrites the remote branch even if someone else pushed to it, and their commits are lost from it. Untick “Skip the safety check” to use --force-with-lease.",
            })
          : step(
              "caution",
              [
                part("git push", "Upload commits."),
                part("--force-with-lease", "Replace the remote branch with yours, but only if nobody has pushed to it since you last fetched."),
                ...target,
              ],
              { warning: "Replaces the remote branch's history. Anyone who pulled it has to reset to the new version." },
            ),
      ];
    },
  },
  {
    id: "fetch",
    category: "remote",
    title: "Fetch from the remote",
    summary: "Downloads new commits and branches without changing your files.",
    synonyms: ["download changes", "git fetch", "update remote branches", "fetch prune"],
    fields: [
      remoteField({ default: "", optional: true, help: "Leave empty to fetch from every remote." }),
      { id: "prune", label: "Remove branches deleted on the remote", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step("safe", [
        part("git fetch", "Download new commits and branches. Your files and branches don't change."),
        a.has("remote") ? part(a.q("remote"), "The remote to fetch from.") : part("--all", "Fetch from every remote."),
        ...when(a.flag("prune"), part("--prune", "Also remove remote-tracking branches whose branch was deleted on the remote.")),
      ]),
    ],
  },
  {
    id: "pull",
    category: "remote",
    title: "Pull changes",
    summary: "Fetches the upstream branch and brings its new commits into yours.",
    synonyms: ["git pull", "update branch", "get latest changes", "pull rebase"],
    fields: [{ id: "rebase", label: "Rebase instead of merge", kind: "checkbox", default: false }],
    build: (a) => [
      step("safe", [
        part("git pull", "Fetch the upstream branch and integrate its new commits."),
        ...when(a.flag("rebase"), part("--rebase", "Replay your local commits on top of the fetched ones instead of making a merge commit.")),
      ]),
    ],
  },
  {
    id: "set-upstream",
    category: "remote",
    title: "Set a branch's upstream",
    summary: "Makes the current branch track a remote branch, so git pull and git push know where to go.",
    synonyms: ["track remote branch", "set-upstream-to", "there is no tracking information"],
    fields: [remoteField(), refField("branch", "Remote branch", { placeholder: "branch" })],
    build: (a) => [
      step("safe", [
        part("git branch", "Change a branch's settings."),
        part(`--set-upstream-to=${a.q("remote")}/${a.q("branch")}`, "Make the current branch track this remote branch."),
      ]),
    ],
  },
];
```

- [ ] **Step 5: Create `catalog/undo.ts`**

```ts
import type { Task } from "../types";
import { backPart, countField, part, pathField, pathsField, pathsPart, refField, remoteField, revisionField, step } from "./helpers";

const PUSHED_WARNING = "Rewrites the branch. For commits you already pushed, revert them instead.";

export const undoTasks: Task[] = [
  {
    id: "unstage-files",
    category: "undo",
    title: "Unstage files",
    summary: "Takes changes out of the staging area. Your edits stay in the files.",
    synonyms: ["undo git add", "remove from staging", "unstage", "reset file"],
    fields: [pathsField()],
    build: (a) => [
      step("safe", [part("git restore --staged", "Remove changes from the staging area, leaving your edits in place."), pathsPart(a, "The files to unstage.")]),
    ],
  },
  {
    id: "discard-file-changes",
    category: "undo",
    title: "Discard changes to files",
    summary: "Throws away unstaged edits, putting files back to how they were staged or last committed.",
    synonyms: ["discard changes", "revert file", "undo changes to file", "reset file changes", "throw away edits"],
    fields: [pathsField()],
    build: (a) => [
      step("destructive", [part("git restore", "Put files back to their staged or last-committed state."), pathsPart(a, "The files to reset.")], {
        warning: "Unstaged edits are deleted, and Git can't bring them back.",
        saferAlternative: { taskId: "stash-changes", label: "Stash the changes instead" },
      }),
    ],
  },
  {
    id: "reset-soft",
    category: "undo",
    title: "Undo last commit, keep changes staged",
    summary: "Removes the last commits from the branch and keeps their changes staged, ready to commit again.",
    synonyms: ["undo last commit", "uncommit", "undo commit keep changes", "rollback commit", "reset soft"],
    fields: [countField("Commits to undo")],
    build: (a) => [
      step("caution", [part("git reset --soft", "Move the branch back. The undone commits' changes stay staged."), backPart(a)], {
        warning: PUSHED_WARNING,
      }),
    ],
    related: ["revert-commit", "reset-mixed"],
  },
  {
    id: "reset-mixed",
    category: "undo",
    title: "Undo last commit, keep changes unstaged",
    summary: "Removes the last commits from the branch. Their changes stay in your files, unstaged.",
    synonyms: ["reset mixed", "undo commit and unstage", "uncommit and unstage"],
    fields: [countField("Commits to undo")],
    build: (a) => [
      step("caution", [part("git reset", "Move the branch back. The undone commits' changes stay in your files, unstaged."), backPart(a)], {
        warning: PUSHED_WARNING,
      }),
    ],
    related: ["revert-commit", "reset-soft"],
  },
  {
    id: "reset-hard",
    category: "undo",
    title: "Delete the last commit and its changes",
    summary: "Removes the last commits and discards their changes, along with every uncommitted change.",
    synonyms: ["reset hard", "delete last commit", "discard last commit", "throw away commit", "go back to previous commit"],
    fields: [countField("Commits to delete")],
    build: (a) => [
      step("destructive", [part("git reset --hard", "Move the branch back and make every file match, discarding all changes."), backPart(a)], {
        warning: "Deletes uncommitted changes for good. The removed commits can be recovered from the reflog for a while.",
        saferAlternative: { taskId: "reset-soft", label: "Keep the changes instead" },
      }),
    ],
    related: ["recover-lost-commit"],
  },
  {
    id: "revert-commit",
    category: "undo",
    title: "Revert a commit",
    summary: "Adds a new commit that undoes an earlier one. History isn't rewritten, so it's the safe way to undo pushed commits.",
    synonyms: ["undo pushed commit", "git revert", "undo a merged change", "reverse commit"],
    fields: [revisionField("commit", "Commit to revert", { default: "HEAD" })],
    build: (a) => [
      step("safe", [part("git revert", "Create a new commit that undoes the given commit's changes."), part(a.q("commit"), "The commit to undo.")]),
    ],
  },
  {
    id: "restore-file-from-commit",
    category: "undo",
    title: "Restore a file from an earlier commit",
    summary: "Overwrites a file with its version from another commit.",
    synonyms: ["get old version of file", "restore file", "checkout file from commit", "recover deleted file"],
    fields: [revisionField("commit", "From commit"), pathField("path", "File")],
    build: (a) => [
      step(
        "destructive",
        [
          part("git restore", "Overwrite files with a version from another commit."),
          part(`--source=${a.q("commit")}`, "The commit to take the file from."),
          part(a.q("path"), "The file to restore."),
        ],
        {
          warning: "Replaces the file's current contents, including uncommitted edits.",
          saferAlternative: { taskId: "stash-changes", label: "Stash your edits first" },
        },
      ),
    ],
  },
  {
    id: "reset-to-remote",
    category: "undo",
    title: "Make a branch match the remote",
    summary: "Throws away local commits and changes so the branch is identical to the remote one.",
    synonyms: ["reset to origin", "discard local commits", "match remote", "start over from remote", "reset hard origin"],
    fields: [remoteField(), refField("branch", "Branch", { default: "main", placeholder: "branch" })],
    build: (a) => [
      step("safe", [part("git fetch", "Download the remote's latest commits."), part(a.q("remote"), "The remote.")]),
      step(
        "destructive",
        [
          part("git reset --hard", "Move the branch and make every file match, discarding all changes."),
          part(`${a.q("remote")}/${a.q("branch")}`, "The remote branch to match."),
        ],
        {
          warning: "Local commits that aren't on the remote, and every uncommitted change, are discarded.",
          saferAlternative: { taskId: "stash-changes", label: "Stash local changes first" },
        },
      ),
    ],
  },
  {
    id: "recover-lost-commit",
    category: "undo",
    title: "Recover a lost commit",
    summary: "Finds a commit you lost after a reset, rebase or deleted branch, and puts a branch on it.",
    synonyms: ["reflog", "undo reset hard", "restore deleted branch", "find lost commit", "undo rebase"],
    fields: [
      revisionField("commit", "Lost commit", { help: "Its hash, from the git reflog output." }),
      refField("branch", "New branch name", { placeholder: "branch-name" }),
    ],
    build: (a) => [
      step("safe", [part("git reflog", "List where HEAD has been, including commits no branch points to any more.")]),
      step("safe", [part("git switch -c", "Create a branch and switch to it."), part(a.q("branch"), "The new branch's name."), part(a.q("commit"), "The lost commit.")]),
    ],
  },
];
```

- [ ] **Step 6: Register them in `catalog/index.ts`**

Add the imports below `import { commitTasks } from "./commits";`:

```ts
import { remoteTasks } from "./remote";
import { undoTasks } from "./undo";
```

And change `TASKS` to:

```ts
export const TASKS: Task[] = [...branchTasks, ...commitTasks, ...remoteTasks, ...undoTasks];
```

- [ ] **Step 7: Run the tests and type check**

Run: `npx vitest run lib/tools/developer/git && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/tools/developer/git/catalog
git commit -m "feat(git): remote and undo tasks"
```

---

### Task 6: Stash, merge & rebase, and tag tasks

**Files:**
- Create: `catalog/stash.ts`, `catalog/merge-rebase.ts`, `catalog/tags.ts`
- Modify: `catalog/index.ts`
- Test: `catalog/stash.test.ts`, `catalog/merge-rebase.test.ts`, `catalog/tags.test.ts`

**Interfaces:**
- Consumes: helpers (Task 3), test-helpers (Task 4).
- Produces: `stashTasks`, `mergeRebaseTasks`, `tagTasks` (each `Task[]`), including `stash-changes`, which Task 5's safer alternatives point to.

- [ ] **Step 1: Write the failing tests in `catalog/stash.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("stash tasks", () => {
  it("stashes, optionally with untracked files and a label", () => {
    expect(command("stash-changes")).toBe("git stash push");
    expect(command("stash-changes", { untracked: true, message: "wip login" })).toBe("git stash push -u -m 'wip login'");
  });

  it("lists, shows, applies and pops by number", () => {
    expect(command("list-stashes")).toBe("git stash list");
    expect(command("show-stash")).toBe("git stash show -p stash@{0}");
    expect(command("apply-stash", { index: "2" })).toBe("git stash apply stash@{2}");
    expect(command("pop-stash")).toBe("git stash pop stash@{0}");
  });

  it("drops and clears destructively", () => {
    expect(command("drop-stash")).toBe("git stash drop stash@{0}");
    expect(danger("drop-stash")).toBe("destructive");
    expect(command("clear-stashes")).toBe("git stash clear");
    expect(danger("clear-stashes")).toBe("destructive");
  });
});
```

- [ ] **Step 2: Write the failing tests in `catalog/merge-rebase.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("merge and rebase tasks", () => {
  it("merges, optionally always with a merge commit", () => {
    expect(command("merge-branch", { branch: "feature/x" })).toBe("git merge feature/x");
    expect(command("merge-branch", { branch: "feature/x", noFf: true })).toBe("git merge --no-ff feature/x");
  });

  it("rebases onto main by default", () => {
    expect(command("rebase-branch")).toBe("git rebase main");
    expect(danger("rebase-branch")).toBe("caution");
  });

  it("continues whichever operation stopped", () => {
    expect(command("continue-after-conflict")).toBe("git add .\ngit merge --continue");
    expect(command("continue-after-conflict", { op: "rebase", paths: "a.ts" })).toBe("git add a.ts\ngit rebase --continue");
    expect(command("continue-after-conflict", { op: "cherry-pick" })).toBe("git add .\ngit cherry-pick --continue");
  });

  it("aborts merges and rebases", () => {
    expect(command("abort-merge")).toBe("git merge --abort");
    expect(command("abort-rebase")).toBe("git rebase --abort");
  });
});
```

- [ ] **Step 3: Write the failing tests in `catalog/tags.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("tag tasks", () => {
  it("creates lightweight and annotated tags", () => {
    expect(command("create-tag", { name: "v1.2.0" })).toBe("git tag v1.2.0");
    expect(command("create-tag", { name: "v1.2.0", commit: "abc1234" })).toBe("git tag v1.2.0 abc1234");
    expect(command("create-annotated-tag", { name: "v1.2.0", message: "Release 1.2.0" })).toBe(
      "git tag -a v1.2.0 -m 'Release 1.2.0'",
    );
  });

  it("lists tags, quoting the pattern so the shell doesn't expand it", () => {
    expect(command("list-tags")).toBe("git tag -l");
    expect(command("list-tags", { pattern: "v1.*" })).toBe("git tag -l 'v1.*'");
  });

  it("pushes one or all tags", () => {
    expect(command("push-tag", { name: "v1.2.0" })).toBe("git push origin v1.2.0");
    expect(command("push-all-tags")).toBe("git push origin --tags");
  });

  it("deletes tags, spelling out the remote ref", () => {
    expect(command("delete-tag", { name: "v1.2.0" })).toBe("git tag -d v1.2.0");
    expect(command("delete-remote-tag", { name: "v1.2.0" })).toBe("git push origin --delete refs/tags/v1.2.0");
    expect(danger("delete-remote-tag", { name: "v1.2.0" })).toBe("caution");
  });
});
```

- [ ] **Step 4: Run them and check they fail**

Run: `npx vitest run lib/tools/developer/git/catalog/stash.test.ts lib/tools/developer/git/catalog/merge-rebase.test.ts lib/tools/developer/git/catalog/tags.test.ts`
Expected: FAIL with `No task "stash-changes".` and the like.

- [ ] **Step 5: Create `catalog/stash.ts`**

```ts
import type { Task } from "../types";
import { messageField, part, stashField, stashRef, step, when } from "./helpers";

export const stashTasks: Task[] = [
  {
    id: "stash-changes",
    category: "stash",
    title: "Stash changes",
    summary: "Saves your uncommitted changes and gives you a clean working tree.",
    synonyms: ["stash", "save changes for later", "shelve", "put changes aside", "git stash"],
    fields: [
      messageField("message", "Label", { optional: true, placeholder: "label" }),
      { id: "untracked", label: "Include new (untracked) files", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step("safe", [
        part("git stash push", "Save uncommitted changes and clean the working tree."),
        ...when(a.flag("untracked"), part("-u", "Include new files Git doesn't track yet.")),
        ...when(a.has("message"), part(`-m ${a.q("message")}`, "A label to recognise the stash by.")),
      ]),
    ],
    related: ["pop-stash", "list-stashes"],
  },
  {
    id: "list-stashes",
    category: "stash",
    title: "List stashes",
    summary: "Shows your saved stashes, newest first.",
    synonyms: ["show stashes", "stash list"],
    fields: [],
    build: () => [step("safe", [part("git stash list", "List stashes. stash@{0} is the newest.")])],
  },
  {
    id: "show-stash",
    category: "stash",
    title: "Show what's in a stash",
    summary: "Shows the changes a stash holds, as a diff.",
    synonyms: ["stash show", "see stash contents", "stash diff"],
    fields: [stashField()],
    build: (a) => [step("safe", [part("git stash show", "Show a stash's changes."), part("-p", "As a full diff."), stashRef(a)])],
  },
  {
    id: "apply-stash",
    category: "stash",
    title: "Apply a stash",
    summary: "Reapplies a stash's changes and keeps the stash.",
    synonyms: ["stash apply", "restore stash", "get stash back"],
    fields: [stashField()],
    build: (a) => [step("safe", [part("git stash apply", "Reapply a stash's changes. The stash is kept."), stashRef(a)])],
    related: ["pop-stash"],
  },
  {
    id: "pop-stash",
    category: "stash",
    title: "Pop a stash",
    summary: "Reapplies a stash's changes and removes it.",
    synonyms: ["stash pop", "unstash", "restore stashed changes"],
    fields: [stashField()],
    build: (a) => [step("safe", [part("git stash pop", "Reapply a stash's changes, then delete it if they applied without conflicts."), stashRef(a)])],
  },
  {
    id: "drop-stash",
    category: "stash",
    title: "Delete a stash",
    summary: "Deletes one stash without applying it.",
    synonyms: ["stash drop", "remove stash", "discard stash"],
    fields: [stashField()],
    build: (a) => [
      step("destructive", [part("git stash drop", "Delete a stash without applying it."), stashRef(a)], {
        warning: "Its changes are gone, short of digging through Git's unreachable objects.",
        saferAlternative: { taskId: "apply-stash", label: "Apply it first" },
      }),
    ],
  },
  {
    id: "clear-stashes",
    category: "stash",
    title: "Delete all stashes",
    summary: "Deletes every stash at once.",
    synonyms: ["stash clear", "remove all stashes"],
    fields: [],
    build: () => [
      step("destructive", [part("git stash clear", "Delete every stash.")], {
        warning: "All stashes are deleted at once.",
        saferAlternative: { taskId: "list-stashes", label: "See what's there first" },
      }),
    ],
  },
];
```

- [ ] **Step 6: Create `catalog/merge-rebase.ts`**

```ts
import type { Task } from "../types";
import { part, pathsField, pathsPart, refField, REWRITE_WARNING, revisionField, step, when } from "./helpers";

const ABORT_WARNING = "Conflict resolutions you've made so far are lost.";

export const mergeRebaseTasks: Task[] = [
  {
    id: "merge-branch",
    category: "merge-rebase",
    title: "Merge a branch",
    summary: "Brings another branch's commits into the current branch.",
    synonyms: ["git merge", "combine branches", "merge into main"],
    fields: [
      refField("branch", "Branch to merge in", { placeholder: "branch" }),
      { id: "noFf", label: "Always create a merge commit", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step("safe", [
        part("git merge", "Bring another branch's commits into the current branch."),
        ...when(a.flag("noFf"), part("--no-ff", "Create a merge commit even when Git could just move the branch forward.")),
        part(a.q("branch"), "The branch to merge in."),
      ]),
    ],
    related: ["abort-merge", "continue-after-conflict"],
  },
  {
    id: "rebase-branch",
    category: "merge-rebase",
    title: "Rebase onto another branch",
    summary: "Replays the current branch's commits on top of another branch, for a straight history.",
    synonyms: ["git rebase", "update branch from main", "rebase on main", "catch up with main"],
    fields: [revisionField("onto", "Onto", { default: "main", placeholder: "branch", help: "Usually main, or origin/main after a fetch." })],
    build: (a) => [
      step("caution", [part("git rebase", "Replay the current branch's commits on top of another branch."), part(a.q("onto"), "The branch to build on.")], {
        warning: REWRITE_WARNING,
      }),
    ],
    related: ["abort-rebase", "continue-after-conflict"],
  },
  {
    id: "continue-after-conflict",
    category: "merge-rebase",
    title: "Continue after fixing conflicts",
    summary: "Marks conflicted files as resolved and carries on with the merge, rebase or cherry-pick.",
    synonyms: ["resolve conflicts", "merge conflict", "rebase continue", "conflict fixed"],
    fields: [
      {
        id: "op",
        label: "What stopped",
        kind: "select",
        default: "merge",
        options: [
          { value: "merge", label: "Merge" },
          { value: "rebase", label: "Rebase" },
          { value: "cherry-pick", label: "Cherry-pick" },
        ],
      },
      pathsField({ help: "The files you fixed, separated by spaces. Leave empty for all files." }),
    ],
    build: (a) => [
      step("safe", [part("git add", "Mark files as resolved by staging them."), pathsPart(a, "The files you fixed.")]),
      step("safe", [part(`git ${a.choice("op")}`, "The operation that stopped for conflicts."), part("--continue", "Carry on now that the conflicts are resolved.")]),
    ],
  },
  {
    id: "abort-merge",
    category: "merge-rebase",
    title: "Abort a merge",
    summary: "Stops a merge that hit conflicts and puts everything back as it was before.",
    synonyms: ["cancel merge", "merge abort", "undo merge in progress"],
    fields: [],
    build: () => [step("caution", [part("git merge --abort", "Stop the merge and return to the state before it started.")], { warning: ABORT_WARNING })],
  },
  {
    id: "abort-rebase",
    category: "merge-rebase",
    title: "Abort a rebase",
    summary: "Stops a rebase and puts the branch back where it started.",
    synonyms: ["cancel rebase", "rebase abort", "undo rebase in progress"],
    fields: [],
    build: () => [step("caution", [part("git rebase --abort", "Stop the rebase and put the branch back where it started.")], { warning: ABORT_WARNING })],
  },
];
```

- [ ] **Step 7: Create `catalog/tags.ts`**

```ts
import { revisionError } from "../ref-name";
import type { Task } from "../types";
import { messageField, part, refField, remoteField, revisionField, step, when } from "./helpers";

const tagName = () => refField("name", "Tag name", { placeholder: "tag", help: "Like v1.2.0." });
const tagCommit = () => revisionField("commit", "Commit", { optional: true, help: "Leave empty to tag the current commit." });

export const tagTasks: Task[] = [
  {
    id: "create-tag",
    category: "tags",
    title: "Create a tag",
    summary: "Creates a lightweight tag: a name pointing at a commit.",
    synonyms: ["git tag", "tag a commit", "mark a release", "lightweight tag"],
    fields: [tagName(), tagCommit()],
    build: (a) => [
      step("safe", [
        part("git tag", "Create a lightweight tag."),
        part(a.q("name"), "The tag's name."),
        ...when(a.has("commit"), part(a.q("commit"), "The commit to tag.")),
      ]),
    ],
    related: ["create-annotated-tag", "push-tag"],
  },
  {
    id: "create-annotated-tag",
    category: "tags",
    title: "Create an annotated tag",
    summary: "Creates a tag that stores who made it, when, and a message. Preferred for releases.",
    synonyms: ["tag -a", "release tag", "tag with message", "version tag"],
    fields: [tagName(), messageField("message", "Message"), tagCommit()],
    build: (a) => [
      step("safe", [
        part("git tag -a", "Create an annotated tag, which stores its author, date and message."),
        part(a.q("name"), "The tag's name."),
        part(`-m ${a.q("message")}`, "The tag's message."),
        ...when(a.has("commit"), part(a.q("commit"), "The commit to tag.")),
      ]),
    ],
    related: ["push-tag"],
  },
  {
    id: "list-tags",
    category: "tags",
    title: "List tags",
    summary: "Shows tags, optionally only those matching a pattern.",
    synonyms: ["show tags", "tag list", "see versions"],
    fields: [
      {
        id: "pattern",
        label: "Pattern",
        kind: "text",
        default: "",
        optional: true,
        placeholder: "pattern",
        help: "Like v1.*. Leave empty for all tags.",
        validate: revisionError,
      },
    ],
    build: (a) => [
      step("safe", [part("git tag -l", "List tags."), ...when(a.has("pattern"), part(a.q("pattern"), "Only tags matching this pattern."))]),
    ],
  },
  {
    id: "push-tag",
    category: "tags",
    title: "Push a tag",
    summary: "Uploads one tag to the remote.",
    synonyms: ["push tag", "publish tag", "upload tag"],
    fields: [remoteField(), tagName()],
    build: (a) => [step("safe", [part("git push", "Upload to the remote."), part(a.q("remote"), "The remote."), part(a.q("name"), "The tag to push.")])],
  },
  {
    id: "push-all-tags",
    category: "tags",
    title: "Push all tags",
    summary: "Uploads every tag the remote doesn't have yet.",
    synonyms: ["push --tags", "publish tags"],
    fields: [remoteField()],
    build: (a) => [
      step("safe", [part("git push", "Upload to the remote."), part(a.q("remote"), "The remote."), part("--tags", "Push every tag the remote doesn't have yet.")]),
    ],
  },
  {
    id: "delete-tag",
    category: "tags",
    title: "Delete a local tag",
    summary: "Deletes a tag from your machine. The remote is untouched.",
    synonyms: ["tag -d", "remove tag"],
    fields: [tagName()],
    build: (a) => [step("safe", [part("git tag -d", "Delete a tag locally."), part(a.q("name"), "The tag to delete.")])],
    related: ["delete-remote-tag"],
  },
  {
    id: "delete-remote-tag",
    category: "tags",
    title: "Delete a tag on the remote",
    summary: "Removes a tag from the remote repository.",
    synonyms: ["remove remote tag", "push --delete tag", "delete release tag"],
    fields: [remoteField(), tagName()],
    build: (a) => [
      step(
        "caution",
        [
          part("git push", "Send a change to the remote."),
          part(a.q("remote"), "The remote."),
          part("--delete", "Delete a ref there."),
          part(`refs/tags/${a.q("name")}`, "The tag, spelled out in full so a branch with the same name is left alone."),
        ],
        { warning: "Removes the tag from the remote. Anyone who already fetched it keeps their copy." },
      ),
    ],
    related: ["delete-tag"],
  },
];
```

- [ ] **Step 8: Register them in `catalog/index.ts`**

Add the imports:

```ts
import { mergeRebaseTasks } from "./merge-rebase";
import { stashTasks } from "./stash";
import { tagTasks } from "./tags";
```

And change `TASKS` to:

```ts
export const TASKS: Task[] = [...branchTasks, ...commitTasks, ...remoteTasks, ...undoTasks, ...stashTasks, ...mergeRebaseTasks, ...tagTasks];
```

- [ ] **Step 9: Run the tests and type check**

Run: `npx vitest run lib/tools/developer/git && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/tools/developer/git/catalog
git commit -m "feat(git): stash, merge, rebase and tag tasks"
```

---

### Task 7: Inspect and cleanup tasks, catalog integrity, task search

**Files:**
- Create: `catalog/inspect.ts`, `catalog/cleanup.ts`, `lib/tools/developer/git/search.ts`
- Modify: `catalog/index.ts`
- Test: `catalog/inspect.test.ts`, `catalog/cleanup.test.ts`, `catalog/catalog.test.ts`, `lib/tools/developer/git/search.test.ts`

**Interfaces:**
- Consumes: helpers, `escapeEre` and `quote` (Task 2), `fieldCombinations` and `resolveTask` (Task 3), `createFuzzySearch` (Task 1).
- Produces: `inspectTasks`, `cleanupTasks`, and `searchTasks(query: string, limit?: number): FuzzyMatch<Task>[]`.

- [ ] **Step 1: Write the failing tests in `catalog/inspect.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { command } from "./test-helpers";

describe("inspect tasks", () => {
  it("shows status and history", () => {
    expect(command("status")).toBe("git status");
    expect(command("log-graph")).toBe("git log --oneline --graph --decorate");
    expect(command("log-graph", { all: true })).toBe("git log --oneline --graph --decorate --all");
  });

  it("diffs unstaged, staged or between two refs", () => {
    expect(command("diff")).toBe("git diff");
    expect(command("diff", { mode: "staged" })).toBe("git diff --staged");
    expect(command("diff", { mode: "between", from: "main", to: "feature/x" })).toBe("git diff main feature/x");
  });

  it("shows commits and blame", () => {
    expect(command("show-commit")).toBe("git show HEAD");
    expect(command("blame", { path: "src/app.ts" })).toBe("git blame src/app.ts");
  });

  it("searches messages and code", () => {
    expect(command("search-commit-messages", { text: "login bug" })).toBe("git log --grep='login bug' -i");
    expect(command("find-code-change", { text: "parseUser" })).toBe("git log -S parseUser");
  });

  it("starts a bisect in three steps", () => {
    expect(command("bisect-start", { good: "v1.0.0" })).toBe("git bisect start\ngit bisect bad HEAD\ngit bisect good v1.0.0");
  });
});
```

- [ ] **Step 2: Write the failing tests in `catalog/cleanup.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { command, danger } from "./test-helpers";

describe("cleanup tasks", () => {
  it("previews and cleans untracked files", () => {
    expect(command("preview-clean")).toBe("git clean -n -d");
    expect(command("clean-untracked")).toBe("git clean -f");
    expect(command("clean-untracked", { dirs: true, ignored: true })).toBe("git clean -f -d -x");
    expect(danger("clean-untracked")).toBe("destructive");
  });

  it("prunes stale remote-tracking branches", () => {
    expect(command("prune-remote-branches")).toBe("git remote prune origin");
  });

  it("deletes merged branches, escaping the base for grep", () => {
    expect(command("delete-merged-branches")).toBe(
      "git branch --merged main | grep -vE '^[*+]|^[[:space:]]*main$' | xargs git branch -d",
    );
    expect(command("delete-merged-branches", { base: "release-1.0" })).toBe(
      "git branch --merged release-1.0 | grep -vE '^[*+]|^[[:space:]]*release-1\\.0$' | xargs git branch -d",
    );
  });
});
```

- [ ] **Step 3: Write the failing integrity tests in `catalog/catalog.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { fieldCombinations, resolveTask } from "../build";
import type { FieldValues, Task } from "../types";
import { GIT_CATEGORIES, getTask, QUICK_START, TASKS } from ".";

/** Defaults, with "sample" in every empty text field so every task can build. */
function sampleValues(task: Task, combo: FieldValues): FieldValues {
  const values = { ...combo };
  for (const field of task.fields) if (values[field.id] === "") values[field.id] = "sample";
  return values;
}

describe("task catalog", () => {
  it("has unique kebab-case ids", () => {
    const ids = TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("lists tasks in category order, with every category used", () => {
    const order = GIT_CATEGORIES.map((c) => c.id);
    const seen = TASKS.map((t) => order.indexOf(t.category));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    for (const category of order) expect(TASKS.some((t) => t.category === category), category).toBe(true);
  });

  it("points only at tasks that exist", () => {
    for (const id of QUICK_START) expect(getTask(id), id).toBeDefined();
    for (const task of TASKS) {
      for (const id of task.related ?? []) expect(getTask(id), `${task.id} related ${id}`).toBeDefined();
    }
  });

  it("has unique field ids, and selects whose default is an option", () => {
    for (const task of TASKS) {
      const ids = task.fields.map((f) => f.id);
      expect(new Set(ids).size, task.id).toBe(ids.length);
      for (const field of task.fields.filter((f) => f.kind === "select")) {
        expect(field.options?.map((o) => o.value), `${task.id}.${field.id}`).toContain(field.default);
      }
    }
  });

  it("builds every option combination into explained, safe-to-paste steps", () => {
    for (const task of TASKS) {
      for (const combo of fieldCombinations(task)) {
        const r = resolveTask(task, sampleValues(task, combo));
        expect(r.status, `${task.id} ${JSON.stringify(combo)}`).toBe("ready");
        if (r.status !== "ready") continue;
        expect(r.steps.length, task.id).toBeGreaterThan(0);
        for (const step of r.steps) {
          for (const p of step.parts) {
            expect(p.text.trim(), task.id).not.toBe("");
            expect(p.explain.trim(), `${task.id} "${p.text}"`).not.toBe("");
            expect(p.text, task.id).not.toContain("HEAD^");
          }
          if (step.danger === "destructive") expect(step.warning, `${task.id} warning`).toBeTruthy();
          if (step.saferAlternative) expect(getTask(step.saferAlternative.taskId), `${task.id} safer`).toBeDefined();
        }
      }
    }
  });
});
```

- [ ] **Step 4: Write the failing task search tests in `lib/tools/developer/git/search.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { searchTasks } from "./search";

const topIds = (query: string, n = 3) => searchTasks(query, n).map((m) => m.item.id);

describe("searchTasks", () => {
  it("ranks the soft reset first for undoing the last commit", () => {
    expect(topIds("undo last commit", 1)).toEqual(["reset-soft"]);
  });

  it.each([
    ["uncommit", "reset-soft"],
    ["delete branch", "delete-branch"],
    ["discard changes", "discard-file-changes"],
    ["force push", "force-push"],
    ["stash my changes", "stash-changes"],
    ["rename branch", "rename-branch"],
    ["who wrote this line", "blame"],
    ["undo pushed commit", "revert-commit"],
  ])("finds %j → %s in the top 3", (query, id) => {
    expect(topIds(query)).toContain(id);
  });

  it("returns nothing for a blank query", () => {
    expect(searchTasks("   ")).toEqual([]);
  });
});
```

- [ ] **Step 5: Run them and check they fail**

Run: `npx vitest run lib/tools/developer/git`
Expected: FAIL: inspect, cleanup and search tasks are missing; integrity fails on "every category used".

- [ ] **Step 6: Create `catalog/inspect.ts`**

```ts
import type { Task } from "../types";
import { messageField, part, pathField, revisionField, step, when } from "./helpers";

export const inspectTasks: Task[] = [
  {
    id: "status",
    category: "inspect",
    title: "See what's changed",
    summary: "Shows staged, unstaged and untracked changes.",
    synonyms: ["git status", "what changed", "modified files"],
    fields: [],
    build: () => [step("safe", [part("git status", "Show staged, unstaged and untracked changes, and the current branch.")])],
  },
  {
    id: "log-graph",
    category: "inspect",
    title: "View commit history as a graph",
    summary: "Shows commits one per line, with branch and merge lines.",
    synonyms: ["git log", "history", "commit history", "log graph", "see commits"],
    fields: [{ id: "all", label: "Include every branch", kind: "checkbox", default: false }],
    build: (a) => [
      step("safe", [
        part("git log", "Show commit history."),
        part("--oneline", "One line per commit."),
        part("--graph", "Draw branch and merge lines."),
        part("--decorate", "Label commits with branch and tag names."),
        ...when(a.flag("all"), part("--all", "Include every branch, not just the current one.")),
      ]),
    ],
  },
  {
    id: "diff",
    category: "inspect",
    title: "See changes line by line",
    summary: "Shows the exact lines that changed.",
    synonyms: ["git diff", "compare", "what did i change", "diff staged", "compare branches"],
    fields: [
      {
        id: "mode",
        label: "Compare",
        kind: "select",
        default: "unstaged",
        options: [
          { value: "unstaged", label: "Unstaged changes" },
          { value: "staged", label: "Staged changes" },
          { value: "between", label: "Two commits or branches" },
        ],
      },
      revisionField("from", "From", { placeholder: "from", shownWhen: (v) => v.mode === "between" }),
      revisionField("to", "To", { placeholder: "to", shownWhen: (v) => v.mode === "between" }),
    ],
    build: (a) => {
      const mode = a.choice("mode");
      if (mode === "staged") {
        return [step("safe", [part("git diff", "Show changes line by line."), part("--staged", "Staged changes: what the next commit will contain.")])];
      }
      if (mode === "between") {
        return [step("safe", [part("git diff", "Show changes line by line."), part(a.q("from"), "The starting point."), part(a.q("to"), "The end point.")])];
      }
      return [step("safe", [part("git diff", "Show changes you haven't staged yet, line by line.")])];
    },
  },
  {
    id: "show-commit",
    category: "inspect",
    title: "Show a commit",
    summary: "Shows a commit's message, author and changes.",
    synonyms: ["git show", "view commit", "inspect commit", "what changed in commit"],
    fields: [revisionField("commit", "Commit", { default: "HEAD" })],
    build: (a) => [step("safe", [part("git show", "Show a commit's message, author and changes."), part(a.q("commit"), "The commit to show.")])],
  },
  {
    id: "blame",
    category: "inspect",
    title: "See who changed each line",
    summary: "Shows the last commit and author for every line of a file.",
    synonyms: ["git blame", "who wrote this", "annotate", "line history"],
    fields: [pathField("path", "File")],
    build: (a) => [step("safe", [part("git blame", "Show who last changed each line, and in which commit."), part(a.q("path"), "The file.")])],
  },
  {
    id: "search-commit-messages",
    category: "inspect",
    title: "Search commit messages",
    summary: "Finds commits whose message contains some text.",
    synonyms: ["log grep", "find commit by message", "search history"],
    fields: [messageField("text", "Text to find", { placeholder: "text" })],
    build: (a) => [
      step("safe", [
        part("git log", "Show commit history."),
        part(`--grep=${a.q("text")}`, "Only commits whose message matches this (a regular expression)."),
        part("-i", "Ignore case."),
      ]),
    ],
  },
  {
    id: "find-code-change",
    category: "inspect",
    title: "Find when code was added or removed",
    summary: "Finds commits that added or removed a piece of text in the code.",
    synonyms: ["pickaxe", "log -S", "when was this function added", "search code history"],
    fields: [messageField("text", "Code to find", { placeholder: "text" })],
    build: (a) => [
      step("safe", [
        part("git log", "Show commit history."),
        part("-S", "Only commits that change how often this text appears, so ones that add or remove it."),
        part(a.q("text"), "The text to look for."),
      ]),
    ],
  },
  {
    id: "bisect-start",
    category: "inspect",
    title: "Find the commit that broke something",
    summary:
      "Starts git bisect, which checks out commits for you to test until it finds the first bad one. Mark each with git bisect good or git bisect bad, and finish with git bisect reset.",
    synonyms: ["bisect", "find bad commit", "which commit introduced bug", "binary search commits"],
    fields: [
      revisionField("bad", "Broken commit", { default: "HEAD", placeholder: "bad-commit" }),
      revisionField("good", "Last working commit", { placeholder: "good-commit" }),
    ],
    build: (a) => [
      step("safe", [part("git bisect start", "Start a binary search through history.")]),
      step("safe", [part("git bisect bad", "Mark a commit that has the problem."), part(a.q("bad"), "A commit with the bug.")]),
      step("safe", [part("git bisect good", "Mark a commit without it."), part(a.q("good"), "An older commit that works.")]),
    ],
  },
];
```

- [ ] **Step 7: Create `catalog/cleanup.ts`**

```ts
import { escapeEre, quote } from "../quote";
import type { Task } from "../types";
import { part, refField, remoteField, step, when } from "./helpers";

export const cleanupTasks: Task[] = [
  {
    id: "preview-clean",
    category: "cleanup",
    title: "Preview removing untracked files",
    summary: "Lists the untracked files and folders git clean would delete, without deleting anything.",
    synonyms: ["clean dry run", "clean -n", "what would be deleted"],
    fields: [],
    build: () => [
      step("safe", [part("git clean", "Remove untracked files."), part("-n", "Dry run: only list what would be removed."), part("-d", "Include untracked folders.")]),
    ],
    related: ["clean-untracked"],
  },
  {
    id: "clean-untracked",
    category: "cleanup",
    title: "Remove untracked files",
    summary: "Deletes files Git doesn't track, like build output or stray files.",
    synonyms: ["git clean", "delete untracked files", "remove new files", "clean -fd", "clean working directory"],
    fields: [
      { id: "dirs", label: "Folders too", kind: "checkbox", default: false },
      { id: "ignored", label: "Ignored files too (build output, .env)", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step(
        "destructive",
        [
          part("git clean", "Remove untracked files."),
          part("-f", "Really delete. Git refuses without it."),
          ...when(a.flag("dirs"), part("-d", "Untracked folders too.")),
          ...when(a.flag("ignored"), part("-x", "Ignored files too, like build output and .env files.")),
        ],
        {
          warning: "Files are deleted from disk, not moved to the trash, and Git can't bring them back.",
          saferAlternative: { taskId: "preview-clean", label: "Preview what would be removed" },
        },
      ),
    ],
  },
  {
    id: "prune-remote-branches",
    category: "cleanup",
    title: "Remove stale remote branches",
    summary: "Removes remote-tracking branches whose branch was deleted on the remote.",
    synonyms: ["remote prune", "clean up remote branches", "stale branches"],
    fields: [remoteField()],
    build: (a) => [step("safe", [part("git remote prune", "Delete remote-tracking branches that no longer exist on the remote."), part(a.q("remote"), "The remote.")])],
  },
  {
    id: "delete-merged-branches",
    category: "cleanup",
    title: "Delete merged local branches",
    summary: "Deletes every local branch that's already merged into a base branch.",
    synonyms: ["clean up branches", "delete old branches", "remove merged branches", "branch cleanup"],
    fields: [refField("base", "Base branch", { default: "main", placeholder: "base" })],
    build: (a) => [
      step(
        "caution",
        [
          part("git branch --merged", "List branches whose commits are all in the base branch."),
          part(a.q("base"), "The base branch."),
          part(
            `| grep -vE ${quote(`^[*+]|^[[:space:]]*${escapeEre(a.text("base"))}$`)}`,
            "Leave out the current branch, branches checked out in other worktrees, and the base branch itself.",
          ),
          part("| xargs git branch -d", "Delete each one. -d still refuses a branch that isn't merged."),
        ],
        { warning: "Uses a shell pipe, so it runs in bash or zsh but not in PowerShell or cmd." },
      ),
    ],
  },
];
```

- [ ] **Step 8: Register them in `catalog/index.ts`**

Add the imports:

```ts
import { cleanupTasks } from "./cleanup";
import { inspectTasks } from "./inspect";
```

And change `TASKS` to:

```ts
export const TASKS: Task[] = [
  ...branchTasks,
  ...commitTasks,
  ...remoteTasks,
  ...undoTasks,
  ...stashTasks,
  ...mergeRebaseTasks,
  ...tagTasks,
  ...inspectTasks,
  ...cleanupTasks,
];
```

- [ ] **Step 9: Create `lib/tools/developer/git/search.ts`**

```ts
import { createFuzzySearch } from "@/lib/search/fuzzy";
import { TASKS } from "./catalog";

/** Ranked task matches for "I want to…" queries. */
export const searchTasks = createFuzzySearch(TASKS, [
  { name: "title", weight: 3 },
  { name: "synonyms", weight: 2 },
  { name: "summary", weight: 1 },
]);
```

- [ ] **Step 10: Run all git tests**

Run: `npx vitest run lib/tools/developer/git`
Expected: PASS. If a search ranking test fails, fix the task's `synonyms` or `title` wording, not the test. Then re-run.

- [ ] **Step 11: Type check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/tools/developer/git
git commit -m "feat(git): inspect and cleanup tasks, catalog integrity and task search"
```

---

### Task 8: URL state hook, danger badge and task picker

There are no component tests in this repo. Verify with the type checker and linter here, and in the real app in Task 9.

**Files:**
- Create: `lib/hooks/useQueryParam.ts`, `components/tools/developer/git/DangerBadge.tsx`, `components/tools/developer/git/TaskPicker.tsx`

**Interfaces:**
- Consumes: `TASKS`, `GIT_CATEGORIES` (Task 4/7), `searchTasks` (Task 7), `maxDanger` (Task 3).
- Produces:
  - `useQueryParam(name: string): [string | null, (value: string | null) => void]`. Setting a value pushes a history entry, so browser Back undoes it.
  - `<DangerBadge danger={Danger} />`, plus `dangerTitles: Record<Danger, string>`.
  - `<TaskPicker query onQueryChange category onCategoryChange initialActiveId onSelect focusOnMount />`, with types as in the code below.

- [ ] **Step 1: Create `lib/hooks/useQueryParam.ts`**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A URL query parameter as state. Setting it pushes a history entry, so browser Back undoes it. Read after mount:
 * tool pages are static, and useSearchParams would need a Suspense boundary.
 */
export function useQueryParam(name: string): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setValue(new URLSearchParams(window.location.search).get(name));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [name]);

  const set = useCallback(
    (next: string | null) => {
      const url = new URL(window.location.href);
      if (next === null) url.searchParams.delete(name);
      else url.searchParams.set(name, next);
      window.history.pushState(null, "", url);
      setValue(next);
    },
    [name],
  );

  return [value, set];
}
```

- [ ] **Step 2: Create `components/tools/developer/git/DangerBadge.tsx`**

```tsx
import { TriangleAlert } from "lucide-react";
import type { Danger } from "@/lib/tools/developer/git/types";

export const dangerTitles: Record<Danger, string> = {
  safe: "Safe",
  caution: "Use with care",
  destructive: "Can lose work",
};

const tones: Record<Exclude<Danger, "safe">, string> = {
  caution: "border-[color:color-mix(in_srgb,var(--accent-warn)_40%,transparent)] text-[color:var(--accent-warn-text)]",
  destructive: "border-[color:color-mix(in_srgb,var(--error)_40%,transparent)] text-[color:var(--error)]",
};

/** Flags caution and destructive tasks and steps with an icon and text, never colour alone. Nothing for safe ones. */
export default function DangerBadge({ danger }: { danger: Danger }) {
  if (danger === "safe") return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-[family-name:var(--font-ui)] text-xs ${tones[danger]}`}
    >
      <TriangleAlert aria-hidden className="h-3 w-3" />
      {dangerTitles[danger]}
    </span>
  );
}
```

- [ ] **Step 3: Create `components/tools/developer/git/TaskPicker.tsx`**

```tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import { maxDanger } from "@/lib/tools/developer/git/build";
import { GIT_CATEGORIES, TASKS } from "@/lib/tools/developer/git/catalog";
import { searchTasks } from "@/lib/tools/developer/git/search";
import type { GitCategoryId, Task } from "@/lib/tools/developer/git/types";
import DangerBadge from "./DangerBadge";

// Worked out once: it builds every checkbox and select combination of every task.
const DANGER = new Map(TASKS.map((task) => [task.id, maxDanger(task)]));

const chipClass = "aria-pressed:border-[color:var(--accent)] aria-pressed:text-[color:var(--accent-text)]";

interface TaskPickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  category: GitCategoryId | null;
  onCategoryChange: (category: GitCategoryId | null) => void;
  /** Highlighted at first, e.g. the task the user just came back from. */
  initialActiveId: string | null;
  onSelect: (task: Task) => void;
  focusOnMount: boolean;
}

/** Search box and category chips over the task list, as an ARIA combobox: arrows move, Enter picks. */
export default function TaskPicker({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  initialActiveId,
  onSelect,
  focusOnMount,
}: TaskPickerProps) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState(initialActiveId);
  const searching = query.trim() !== "";

  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);

  const visible = useMemo(() => {
    const tasks = searching ? searchTasks(query).map((m) => m.item) : TASKS;
    return category ? tasks.filter((t) => t.category === category) : tasks;
  }, [query, category, searching]);

  // While searching, the best match is active until the user moves.
  const found = visible.findIndex((t) => t.id === activeId);
  const current = found >= 0 ? found : searching && visible.length > 0 ? 0 : -1;
  const optionId = (task: Task) => `${listId}-${task.id}`;

  function move(by: number) {
    if (visible.length === 0) return;
    const next = current < 0 ? (by > 0 ? 0 : visible.length - 1) : (current + by + visible.length) % visible.length;
    setActiveId(visible[next].id);
    document.getElementById(optionId(visible[next]))?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && current >= 0) {
      e.preventDefault();
      onSelect(visible[current]);
    }
  }

  function option(task: Task) {
    const index = visible.indexOf(task);
    return (
      <div
        key={task.id}
        id={optionId(task)}
        role="option"
        aria-selected={index === current}
        onClick={() => onSelect(task)}
        onMouseMove={() => setActiveId(task.id)}
        className={`flex cursor-pointer items-start justify-between gap-3 rounded-md px-3 py-2 ${
          index === current ? "bg-[color:var(--control-selected)] ring-1 ring-[color:var(--border)]" : ""
        }`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{task.title}</span>
          <span className="block text-xs text-[color:var(--text-muted)]">{task.summary}</span>
        </span>
        <DangerBadge danger={DANGER.get(task.id) ?? "safe"} />
      </div>
    );
  }

  const groups = searching ? null : GIT_CATEGORIES.map((c) => ({ ...c, tasks: visible.filter((t) => t.category === c.id) }));

  return (
    <div className="space-y-4">
      <SearchInput
        ref={input}
        value={query}
        onChange={onQueryChange}
        label="Search Git tasks"
        placeholder="undo last commit, delete branch…"
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={current >= 0 ? optionId(visible[current]) : undefined}
        onKeyDown={onKeyDown}
      />

      <div role="group" aria-label="Categories" className="flex flex-wrap gap-2">
        <Button size="sm" className={chipClass} aria-pressed={category === null} onClick={() => onCategoryChange(null)}>
          All
        </Button>
        {GIT_CATEGORIES.map((c) => (
          <Button
            key={c.id}
            size="sm"
            className={chipClass}
            aria-pressed={category === c.id}
            onClick={() => onCategoryChange(category === c.id ? null : c.id)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {visible.length === 1 ? "1 task" : `${visible.length} tasks`}
      </p>

      {visible.length === 0 ? (
        <div className="py-6 text-center text-sm text-[color:var(--text-muted)]">
          <p>No matching task.</p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              onQueryChange("");
              onCategoryChange(null);
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div id={listId} role="listbox" aria-label="Git tasks" className="max-h-[32rem] space-y-1 overflow-y-auto">
          {groups
            ? groups
                .filter((g) => g.tasks.length > 0)
                .map((g) => (
                  <div key={g.id} role="group" aria-labelledby={`${listId}-${g.id}-label`}>
                    <div id={`${listId}-${g.id}-label`} className="px-3 pb-1 pt-3 text-xs font-medium text-[color:var(--accent-text)]">
                      {g.label}
                    </div>
                    {g.tasks.map(option)}
                  </div>
                ))
            : visible.map(option)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors or warnings in the new files.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/useQueryParam.ts components/tools/developer/git
git commit -m "feat(git): task picker, danger badge and URL state hook"
```

---

### Task 9: Task form, command output, tool component and registration

**Files:**
- Create: `components/tools/developer/git/TaskForm.tsx`, `components/tools/developer/git/CommandOutput.tsx`, `components/tools/developer/GitCommandBuilder.tsx`, `registry/tools/developer/git-command-builder.ts`
- Modify: `registry/data-types.ts`, `registry/tools/developer/index.ts`, `components/catalog/icons.tsx`
- Test: `registry/registry.test.ts` (unchanged; its SEO checks cover the new entry)

**Interfaces:**
- Consumes: everything above.
- Produces: the registered `git-command-builder` tool at `/tools/developer/git-command-builder`.

- [ ] **Step 1: Add the `git` data type in `registry/data-types.ts`**

Add `"git",` after `"mongodb",` in `DATA_TYPES`, and add `git: "Git command",` after `mongodb: "MongoDB query",` in `dataTypeLabels`.

- [ ] **Step 2: Create `components/tools/developer/git/TaskForm.tsx`**

```tsx
"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";
import TextInput from "@/components/ui/TextInput";
import { visibleFields } from "@/lib/tools/developer/git/build";
import type { Field as TaskField, FieldValue, FieldValues, Task } from "@/lib/tools/developer/git/types";

interface TaskFormProps {
  task: Task;
  values: FieldValues;
  errors: Record<string, string>;
  onChange: (id: string, value: FieldValue) => void;
  onBack: () => void;
  focusOnMount: boolean;
}

export default function TaskForm({ task, values, errors, onChange, onBack, focusOnMount }: TaskFormProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Lands keyboard and screen reader users on the task they picked.
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);

  const fields = visibleFields(task, values);

  return (
    <div className="space-y-5">
      <div>
        <Button size="sm" icon={ArrowLeft} onClick={onBack}>
          All tasks
        </Button>
        <h2 ref={heading} tabIndex={-1} className="mt-4 font-[family-name:var(--font-ui)] text-lg font-semibold focus:outline-none">
          {task.title}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">{task.summary}</p>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">Nothing to fill in: the command is ready.</p>
      ) : (
        fields.map((field) => (
          <FieldControl key={field.id} task={task} field={field} value={values[field.id]} error={errors[field.id]} onChange={onChange} />
        ))
      )}
    </div>
  );
}

interface FieldControlProps {
  task: Task;
  field: TaskField;
  value: FieldValue | undefined;
  error: string | undefined;
  onChange: (id: string, value: FieldValue) => void;
}

function FieldControl({ task, field, value, error, onChange }: FieldControlProps) {
  const id = `git-${task.id}-${field.id}`;
  const errorId = `${id}-error`;

  if (field.kind === "checkbox") {
    return (
      <Checkbox checked={value === true} onChange={(checked) => onChange(field.id, checked)}>
        {field.label}
      </Checkbox>
    );
  }

  const text = typeof value === "string" ? value : "";
  const label = field.optional ? (
    <>
      {field.label} <span className="font-normal text-[color:var(--text-muted)]">(optional)</span>
    </>
  ) : (
    field.label
  );

  let control;
  if (field.kind === "select") {
    control = (
      <Select id={id} value={text} onChange={(e) => onChange(field.id, e.target.value)}>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  } else {
    const shared = {
      id,
      value: text,
      placeholder: field.placeholder,
      onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(field.id, e.target.value),
      "aria-describedby": error ? errorId : undefined,
    };
    control =
      field.kind === "prose" ? (
        <TextInput {...shared} aria-invalid={Boolean(error)} />
      ) : (
        <CodeInput {...shared} invalid={Boolean(error)} inputMode={field.kind === "number" ? "numeric" : undefined} />
      );
  }

  return (
    <Field label={label} htmlFor={id} help={field.help}>
      {control}
      {error && (
        <p id={errorId} className="text-xs text-[color:var(--error)]">
          {error}
        </p>
      )}
    </Field>
  );
}
```

- [ ] **Step 3: Create `components/tools/developer/git/CommandOutput.tsx`**

```tsx
"use client";

import { Fragment } from "react";
import { TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Section from "@/components/ui/Section";
import { placeholderToken, stepCommand, type Resolved } from "@/lib/tools/developer/git/build";
import { getTask, QUICK_START } from "@/lib/tools/developer/git/catalog";
import { escapeEre } from "@/lib/tools/developer/git/quote";
import type { Step, Task } from "@/lib/tools/developer/git/types";
import DangerBadge, { dangerTitles } from "./DangerBadge";

interface CommandOutputProps {
  task: Task | null;
  resolved: Resolved | null;
  onSelectTask: (id: string) => void;
}

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

export default function CommandOutput({ task, resolved, onSelectTask }: CommandOutputProps) {
  if (!task || !resolved) return <QuickStart onSelectTask={onSelectTask} />;

  if (resolved.status === "invalid") {
    return (
      <Alert title="Fix the highlighted fields">
        <ul className="list-disc pl-5">
          {task.fields
            .filter((f) => resolved.errors[f.id])
            .map((f) => (
              <li key={f.id}>
                {f.label}: {resolved.errors[f.id]}
              </li>
            ))}
        </ul>
      </Alert>
    );
  }

  const ready = resolved.status === "ready";
  const tokens = resolved.status === "incomplete" ? resolved.missing.map(placeholderToken) : [];
  const { steps } = resolved;

  return (
    <div className="space-y-6 font-[family-name:var(--font-ui)]">
      {resolved.status === "incomplete" && (
        <p className="text-sm text-[color:var(--text-muted)]">
          Fill in {listFormat.format(resolved.missing.map((f) => f.label.toLowerCase()))} to copy the command.
        </p>
      )}

      {steps.length === 1 ? (
        <StepView step={steps[0]} tokens={tokens} onSelectTask={onSelectTask} />
      ) : (
        <ol className="space-y-8">
          {steps.map((s, i) => (
            <li key={i}>
              <StepView step={s} number={i + 1} copyable={ready} tokens={tokens} onSelectTask={onSelectTask} />
            </li>
          ))}
        </ol>
      )}

      {task.related && task.related.length > 0 && (
        <Section label="Related">
          <div className="flex flex-wrap gap-2">
            {task.related.map((id) => (
              <Button key={id} size="sm" onClick={() => onSelectTask(id)}>
                {getTask(id)?.title}
              </Button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

interface StepViewProps {
  step: Step;
  /** Set for multi-step tasks: shows a numbered header with the step's own copy button. */
  number?: number;
  copyable?: boolean;
  tokens: string[];
  onSelectTask: (id: string) => void;
}

function StepView({ step, number, copyable = false, tokens, onSelectTask }: StepViewProps) {
  const command = stepCommand(step);
  const alternative = step.saferAlternative;

  return (
    <div className="space-y-3">
      {number !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium text-[color:var(--accent-text)]">Step {number}</h3>
          <div className="flex items-center gap-2">
            <DangerBadge danger={step.danger} />
            <CopyButton text={copyable ? command : undefined} />
          </div>
        </div>
      )}

      {step.danger !== "safe" && step.warning && (
        <Alert
          tone={step.danger === "destructive" ? "error" : "warn"}
          title={
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert aria-hidden className="h-4 w-4" />
              {dangerTitles[step.danger]}
            </span>
          }
        >
          <p>{step.warning}</p>
          {alternative && (
            <Button size="sm" className="mt-3" onClick={() => onSelectTask(alternative.taskId)}>
              {alternative.label}
            </Button>
          )}
        </Alert>
      )}

      <p className="whitespace-pre-wrap break-words rounded-md border border-[color:var(--border)] p-3 font-[family-name:var(--font-mono)] text-sm">
        <CommandText text={command} tokens={tokens} />
      </p>

      <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
        {step.parts.map((p, i) => (
          <Fragment key={i}>
            <dt className="break-all font-[family-name:var(--font-mono)]">
              <CommandText text={p.text} tokens={tokens} />
            </dt>
            <dd className="text-[color:var(--text-muted)]">{p.explain}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

/** Command text with the <placeholder> tokens of still-empty fields muted. */
function CommandText({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{text}</>;
  const pieces = text.split(new RegExp(`(${tokens.map(escapeEre).join("|")})`));
  return (
    <>
      {pieces.map((piece, i) =>
        tokens.includes(piece) ? (
          <span key={i} className="italic text-[color:var(--text-muted)]">
            {piece}
          </span>
        ) : (
          <Fragment key={i}>{piece}</Fragment>
        ),
      )}
    </>
  );
}

function QuickStart({ onSelectTask }: { onSelectTask: (id: string) => void }) {
  return (
    <div className="space-y-4 font-[family-name:var(--font-ui)]">
      <p className="text-[color:var(--text-muted)]">Pick a task to see its command, with every part explained.</p>
      <Section label="Popular">
        <div className="flex flex-wrap gap-2">
          {QUICK_START.map((id) => (
            <Button key={id} size="sm" onClick={() => onSelectTask(id)}>
              {getTask(id)?.title}
            </Button>
          ))}
        </div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/tools/developer/GitCommandBuilder.tsx`**

```tsx
"use client";

import { useState } from "react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { useQueryParam } from "@/lib/hooks/useQueryParam";
import { commandText, defaultValues, resolveTask } from "@/lib/tools/developer/git/build";
import { getTask } from "@/lib/tools/developer/git/catalog";
import type { FieldValue, FieldValues, GitCategoryId } from "@/lib/tools/developer/git/types";
import CommandOutput from "./git/CommandOutput";
import TaskForm from "./git/TaskForm";
import TaskPicker from "./git/TaskPicker";

export default function GitCommandBuilder() {
  const [taskParam, setTaskParam] = useQueryParam("task");
  // An unknown ?task= falls back to the list.
  const task = (taskParam && getTask(taskParam)) || null;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GitCategoryId | null>(null);
  // Values belong to one task: switching tasks starts again from that task's defaults.
  const [form, setForm] = useState<{ taskId: string; values: FieldValues } | null>(null);
  // Where focus goes after the user changes view; nothing moves it on first load.
  const [focus, setFocus] = useState<"form" | "picker" | null>(null);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);

  const values = task ? (form?.taskId === task.id ? form.values : defaultValues(task)) : null;
  const resolved = task && values ? resolveTask(task, values) : null;

  function open(id: string) {
    setFocus("form");
    setTaskParam(id);
  }

  function back() {
    setLastTaskId(task?.id ?? null);
    setFocus("picker");
    setTaskParam(null);
  }

  function change(id: string, value: FieldValue) {
    if (task && values) setForm({ taskId: task.id, values: { ...values, [id]: value } });
  }

  return (
    <>
      <InputPanel label="What do you want to do?">
        {task && values ? (
          <TaskForm
            key={task.id}
            task={task}
            values={values}
            errors={resolved?.status === "invalid" ? resolved.errors : {}}
            onChange={change}
            onBack={back}
            focusOnMount={focus === "form"}
          />
        ) : (
          <TaskPicker
            query={query}
            onQueryChange={setQuery}
            category={category}
            onCategoryChange={setCategory}
            initialActiveId={lastTaskId}
            onSelect={(t) => open(t.id)}
            focusOnMount={focus === "picker"}
          />
        )}
      </InputPanel>
      <OutputPanel label="Command" copyText={resolved?.status === "ready" ? commandText(resolved.steps) : undefined} outputType="git">
        <CommandOutput task={task} resolved={resolved} onSelectTask={open} />
      </OutputPanel>
    </>
  );
}
```

- [ ] **Step 5: Create `registry/tools/developer/git-command-builder.ts`**

```ts
import type { ToolConfig } from "@/registry/types";

const gitCommandBuilder: ToolConfig = {
  id: "git-command-builder",
  category: "developer",
  title: "Git Command Builder",
  description: "Find the right Git command for what you want to do, with every part explained and risky commands flagged.",
  keywords: [
    "git",
    "git command",
    "git commands",
    "git cheat sheet",
    "git command generator",
    "undo last commit",
    "git reset",
    "git revert",
    "git rebase",
    "git stash",
    "delete branch",
    "rename branch",
    "force push",
    "git clean",
    "git reflog",
    "git tag",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/developer/GitCommandBuilder"),
  consumes: [],
  produces: ["git"],
};

export default gitCommandBuilder;
```

- [ ] **Step 6: Register it and give it an icon**

In `registry/tools/developer/index.ts`, add `import gitCommandBuilder from "./git-command-builder";` after the `envGenerator` import, and append `gitCommandBuilder` to the end of the `developerTools` array.

In `components/catalog/icons.tsx`, add `GitBranch,` to the lucide import list (alphabetical, after `Fingerprint,`), and add `"git-command-builder": GitBranch,` after the `"sql-to-mongo": ArrowRightLeft,` entry in `toolIcons`.

- [ ] **Step 7: Run the whole test suite, type check and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all PASS. This includes `registry/registry.test.ts` (SEO fields, unique title) and the existing search tests. If a site-search test now ranks Git Command Builder above the expected tool, trim the keyword that collides. Don't change the test.

- [ ] **Step 8: Check it in the running app**

Never run `next build`. First check for a running dev server: `ps aux | grep "next dev" | grep -v grep`. If there is none, start one in the background with `npm run dev`. Open `http://localhost:3000/tools/developer/git-command-builder` and check:
- The task list is grouped by category. Typing "undo last commit" highlights "Undo last commit, keep changes staged" first. ↓/↑ and Enter work.
- Picking a task moves focus to its heading, and the URL becomes `?task=reset-soft`. Browser Back returns to the list.
- `git reset --soft HEAD~1` shows with an explanation row per part and a caution alert. The panel's Copy copies it.
- Clearing the count shows `HEAD~<n>` muted and disables Copy. Typing `-f` as a branch name in Create branch shows the inline error and the error alert.
- "Delete the last commit and its changes" shows the red alert, and "Keep the changes instead" switches to the soft reset.
- "Rename a branch on the remote too" shows three numbered steps with their own Copy buttons.
- At a 375px width the page doesn't scroll sideways. The output is readable in both light and dark themes.

- [ ] **Step 9: Commit**

```bash
git add registry components lib
git commit -m "feat(git): git command builder tool"
```
