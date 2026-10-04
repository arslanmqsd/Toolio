# Git Command Builder — Design

Date: 2026-10-04
Status: Draft, awaiting review

## Goal

A developer-category tool that turns "I want to…" into a correct Git command. The user searches or browses tasks
("undo last commit", "delete branch"), fills one or two fields, and copies a ready-to-run command, with every part
explained and dangerous commands clearly flagged.

**Success:** a developer types "undo last commit", picks the right task, fills at most a couple of fields, copies a
correct command, and understands what each part does before running it.

## Scope

In v1:

- Searchable, filterable task catalog (~60 tasks across 9 categories).
- Per-task form; command updates live (no Generate button).
- Multi-command tasks render as ordered steps.
- Danger level per step, warnings, safer alternatives, related tasks.
- Per-part explanation of every generated command.
- Selected task kept in the URL (`?task=<id>`).

Out of v1 (separate spec later):

- Paste a command → explain it (Command → Explain parser).
- Natural-language input beyond fuzzy search; any network/AI call.
- PowerShell/cmd quoting. Output targets POSIX shells (bash/zsh).

## Conventions

- Modern syntax: `git switch` / `git restore`, never `checkout` for these jobs.
- Revisions written as `HEAD~N`, never `HEAD^` (`^` is a glob character in zsh with `extendedglob`).
- Fully client-side; pure logic in `lib/`, UI in `components/`, matching existing tools.

## Architecture

### Files

```
lib/tools/developer/git/
  types.ts          Task, Field, Step, Part, Danger, GitCategoryId
  quote.ts          POSIX shell quoting
  ref-name.ts       git check-ref-format validation, revision/number/url validators
  catalog/
    branches.ts  commits.ts  remote.ts  undo.ts  stash.ts
    merge-rebase.ts  tags.ts  inspect.ts  cleanup.ts
    index.ts        TASKS (all tasks), GIT_CATEGORIES (id + label, display order), getTask(id)
  build.ts          resolveTask(task, values) → validation result + steps (see Data flow)
  search.ts         fuse.js search over tasks
  quote.test.ts  ref-name.test.ts  catalog.test.ts  search.test.ts
  catalog/<category>.test.ts
components/tools/developer/GitCommandBuilder.tsx   (split into subcomponents if it passes ~250 lines)
registry/tools/developer/git-command-builder.ts
registry/data-types.ts                              add "git" → "Git command"
```

### Types

```ts
type Danger = "safe" | "caution" | "destructive";

type GitCategoryId =
  | "branches" | "commits" | "remote" | "undo" | "stash"
  | "merge-rebase" | "tags" | "inspect" | "cleanup";

type FieldValue = string | boolean | number;

interface Field {
  id: string;
  label: string;
  help?: string;
  kind: "text" | "select" | "checkbox" | "number";
  default: FieldValue;          // required text fields default to ""
  placeholder?: string;         // also used as the <placeholder> in output while empty, e.g. "branch-name"
  options?: { value: string; label: string }[];   // select only
  optional?: boolean;           // text only; required otherwise
  validate?: (value: FieldValue) => string | null; // message or null
}

interface Part {
  text: string;                 // already shell-quoted
  explain: string;              // e.g. "Keep the undone changes staged."
}

interface Step {
  parts: Part[];                // joined with " " to form the command
  danger: Danger;
  warning?: string;             // required when danger === "destructive"; recommended for "caution"
  saferAlternative?: { taskId: string; label: string };
}

interface Task {
  id: string;                   // kebab-case, stable: used in the URL
  category: GitCategoryId;
  title: string;                // "Undo last commit, keep changes staged"
  summary: string;              // one sentence, shown in list and output
  synonyms: string[];           // search aliases: "uncommit", "rollback last commit"
  fields: Field[];
  build: (values: Record<string, FieldValue>) => Step[];   // pure
  related?: string[];           // task ids
}
```

A task's overall danger (for the list badge) is the highest danger among `build(defaults)` steps, plus any higher
danger reachable through a checkbox (e.g. force-delete), computed by a helper `maxDanger(task)` that builds with
each checkbox toggled.

### Data flow

```
selected task + field values
  → resolveTask():
      for each field: empty required → "missing"; else validate() → error | ok
      any error   → { status: "invalid", errors }
      any missing → { status: "incomplete", missing, steps }   // steps built with <placeholder> text
      otherwise   → { status: "ready", steps }
  → output panel renders by status
```

In the "incomplete" case `build` receives `<placeholder>` strings for missing fields (inserted unquoted, rendered
muted) so the user always sees the command's shape.

### Registry entry

```ts
{
  id: "git-command-builder",
  category: "developer",
  title: "Git Command Builder",
  description: "Find the right Git command for what you want to do, with every part explained and risky commands flagged.",
  keywords: ["git", "git command", "git cheat sheet", "undo commit", "git reset", "git revert", "git rebase",
             "git stash", "delete branch", "rename branch", "force push", "git generator", ...],
  actions: ["generate"],
  component: () => import("@/components/tools/developer/GitCommandBuilder"),
  consumes: [],
  produces: ["git"],
}
```

## UI

### Input panel — "What do you want to do?"

1. **Search** (`SearchInput`), placeholder "undo last commit, delete branch…". Filters as you type. Combobox
   pattern: `role="combobox"`, results `role="listbox"`, `aria-activedescendant`; ↑/↓ move, Enter selects,
   Escape clears.
2. **Category chips**: All + the 9 categories, toggle buttons with `aria-pressed`. Combine with search.
3. **Task list**: row = title, summary, danger badge for caution/destructive (icon + text, never colour alone).
   Grouped by category when search is empty; ranked by score when searching. Empty result: "No matching task" with a
   "Clear filters" button.
4. **Task form** replaces the list when a task is selected: "← All tasks" back button, task title as heading, fields
   via `Field` + `TextInput` / `Select` / `Checkbox`. Inline errors linked with `aria-describedby`. Focus moves to
   the heading on open and back to the previously selected row on return.

**URL:** `?task=<id>` set on select (pushState, so browser Back returns to the list); read on load. Unknown id →
list view. Field values are component state only, reset to defaults when switching task.

### Output panel — "Command"

- **No task selected**: short prompt plus quick-start buttons: undo last commit (keep changes), create branch,
  stash changes, discard file changes.
- **Ready, one step**: command in `CodeBlock`; panel Copy (`OutputPanel copyText`) copies it.
- **Ready, multiple steps**: numbered list; each step has its own code block, Copy button and danger badge. Panel Copy
  copies all steps joined with `\n`.
- **Warnings**: destructive step → `Alert` (danger tone, warning icon) above its command; caution with a warning →
  warn tone. `saferAlternative` renders as a button inside the alert that switches to that task.
- **Explanation**: `ValueTable` under each step, one row per part (`text` → `explain`). Always visible.
- **Summary** line above the command; **Related** task links below ("Lost commits? Recover with reflog").
- **Incomplete**: command shown with muted `<placeholder>` parts, Copy disabled, hint "Fill in <field label>".
- **Invalid**: `Alert` listing the field errors instead of the command.

**Mobile:** panels stack (input then output); chips wrap, no horizontal scroll.

## Catalog (v1)

🟢 safe · 🟡 caution · 🔴 destructive. Field lists are indicative; each category test file pins exact output.

### Branches
- `create-branch` 🟢 — name, start point (optional) → `git switch -c <name> [<start>]`
- `switch-branch` 🟢 — name → `git switch <name>`
- `checkout-remote-branch` 🟢 — remote (default origin), branch → `git switch --track <remote>/<branch>`
- `rename-branch` 🟢 — old (optional = current), new → `git branch -m [<old>] <new>`
- `rename-branch-remote` 🟡 — old, new, remote → 3 steps: `git branch -m <old> <new>`;
  `git push -u <remote> <new>`; `git push <remote> --delete <old>`
- `delete-branch` 🟢/🔴 — name, checkbox "Force (delete even if unmerged)" → `git branch -d|-D <name>`
- `delete-remote-branch` 🟡 — remote, branch → `git push <remote> --delete <branch>`
- `list-branches` 🟢 — select local/remote/all, checkbox show upstream → `git branch [-r|-a] [-vv]`
- `add-worktree` 🟢 — path, branch, checkbox new branch → `git worktree add [-b <branch>] <path> [<branch>]`

### Commits
- `commit-staged` 🟢 — subject, body (optional) → `git commit -m <subject> [-m <body>]`
- `commit-all` 🟢 — subject, body → `git add -A`; `git commit -m …`
- `amend-message` 🟡 — subject → `git commit --amend -m <subject>`; warning about rewriting pushed commits
- `amend-add-files` 🟡 — paths (optional = all) → `git add <paths|-A>`; `git commit --amend --no-edit`
- `squash-last-n` 🟡 — N, subject → `git reset --soft HEAD~N`; `git commit -m <subject>`
- `interactive-rebase` 🟡 — N → `git rebase -i HEAD~N`
- `fixup-commit` 🟡 — target commit, base → `git commit --fixup=<target>`; `git rebase -i --autosquash <base>`
- `cherry-pick` 🟢 — commit → `git cherry-pick <commit>`
- `empty-commit` 🟢 — subject → `git commit --allow-empty -m <subject>`

### Remote
- `add-remote` 🟢 — name, url → `git remote add <name> <url>`
- `change-remote-url` 🟢 — name, url → `git remote set-url <name> <url>`
- `list-remotes` 🟢 → `git remote -v`
- `push` 🟢 → `git push`
- `push-set-upstream` 🟢 — remote, branch → `git push -u <remote> <branch>`
- `force-push` 🟡/🔴 — remote, branch, checkbox "Skip lease check" → `git push --force-with-lease|--force …`;
  plain `--force` saferAlternative → lease variant
- `fetch` 🟢 — remote (optional = all), checkbox prune → `git fetch [<remote>|--all] [--prune]`
- `pull` 🟢 — checkbox rebase → `git pull [--rebase]`
- `set-upstream` 🟢 — remote, branch → `git branch --set-upstream-to=<remote>/<branch>`

### Undo
- `unstage-files` 🟢 — paths (optional = all) → `git restore --staged <paths|.>`
- `discard-file-changes` 🔴 — paths (optional = all) → `git restore <paths|.>`; saferAlternative → `stash-changes`
- `reset-soft` 🟡 — N (default 1) → `git reset --soft HEAD~N`
- `reset-mixed` 🟡 — N → `git reset HEAD~N`
- `reset-hard` 🔴 — N → `git reset --hard HEAD~N`; saferAlternative → `reset-soft`; related `recover-lost-commit`
- `revert-commit` 🟢 — commit → `git revert <commit>`; summary notes it is the safe way to undo pushed commits
- `restore-file-from-commit` 🔴 — commit, path → `git restore --source=<commit> <path>`
- `reset-to-remote` 🔴 — remote, branch → `git fetch <remote>`; `git reset --hard <remote>/<branch>`
- `recover-lost-commit` 🟢 — commit (from reflog), new branch → `git reflog`; `git switch -c <branch> <commit>`

### Stash
- `stash-changes` 🟢 — message (optional), checkbox include untracked → `git stash push [-u] [-m <msg>]`
- `list-stashes` 🟢 → `git stash list`
- `show-stash` 🟢 — index → `git stash show -p stash@{N}`
- `apply-stash` 🟢 — index → `git stash apply stash@{N}`
- `pop-stash` 🟢 — index → `git stash pop stash@{N}`
- `drop-stash` 🔴 — index → `git stash drop stash@{N}`
- `clear-stashes` 🔴 → `git stash clear`

### Merge & Rebase
- `merge-branch` 🟢 — branch, checkbox no-ff → `git merge [--no-ff] <branch>`
- `rebase-branch` 🟡 — onto → `git rebase <onto>`
- `continue-after-conflict` 🟢 — select merge/rebase → `git add <paths|.>`; `git merge|rebase --continue`
- `abort-merge` 🟡 → `git merge --abort`
- `abort-rebase` 🟡 → `git rebase --abort`

### Tags
- `create-tag` 🟢 — name, commit (optional) → `git tag <name> [<commit>]`
- `create-annotated-tag` 🟢 — name, message, commit → `git tag -a <name> -m <msg> [<commit>]`
- `list-tags` 🟢 — pattern (optional) → `git tag -l [<pattern>]`
- `push-tag` 🟢 — remote, name → `git push <remote> <name>`
- `push-all-tags` 🟢 — remote → `git push <remote> --tags`
- `delete-tag` 🟢 — name → `git tag -d <name>`
- `delete-remote-tag` 🟡 — remote, name → `git push <remote> --delete <name>`

### Inspect
- `status` 🟢 → `git status`
- `log-graph` 🟢 — checkbox all branches → `git log --oneline --graph --decorate [--all]`
- `diff` 🟢 — select unstaged/staged/between refs (+ from, to) → `git diff [--staged | <from>..<to>]`
- `show-commit` 🟢 — commit → `git show <commit>`
- `blame` 🟢 — path → `git blame <path>`
- `search-commit-messages` 🟢 — text → `git log --grep=<text>`
- `find-code-change` 🟢 — text → `git log -S <text>`
- `bisect-start` 🟢 — bad (default HEAD), good → `git bisect start`; `git bisect bad <bad>`; `git bisect good <good>`

### Cleanup
- `preview-clean` 🟢 → `git clean -n -d`
- `clean-untracked` 🔴 — checkboxes directories, ignored → `git clean -f [-d] [-x]`;
  saferAlternative → `preview-clean`
- `prune-remote-branches` 🟢 — remote → `git remote prune <remote>`
- `delete-merged-branches` 🟡 — base (default main) →
  `git branch --merged <base> | grep -vE '^[*+]|^[[:space:]]*<base>$' | xargs git branch -d`; notes bash/zsh
  only (`[*+]` skips the current branch and branches checked out in other worktrees)

## Quoting

`quote(arg)`:
- Leave bare when `arg` matches `^[A-Za-z0-9_./:@%+=,{}][A-Za-z0-9_./:@%+=,~{}-]*$` (so a leading `-` or `~` is
  quoted).
- Otherwise wrap in single quotes, replacing each `'` with `'\''`.
- Empty string → `''`.

All user values go through `quote` inside `build`. Literal flags and fixed text (e.g. `HEAD~1`, the cleanup pipe)
are written already-safe. Quoting is shell safety only: it does not stop Git reading a leading `-` as an option,
so validators reject that (see Validation).

## Validation

- **Ref names** (`check-ref-format`), each with its own message: no whitespace or control characters; none of
  `~ ^ : ? * [ \`; no `..`; no `@{`; not `@` alone; no leading/trailing `/`; no `//`; no component starting with `.`;
  not ending with `.` or `.lock`.
- **Revision**: non-empty, no whitespace, no leading `-`.
- Ref names also reject a leading `-`.
- **N / stash index**: integer, N ≥ 1, index ≥ 0.
- **Remote URL**: non-empty, no whitespace.
- **Paths**: free text, space-separated list; each path quoted individually.
- **Commit subject**: non-empty, single line.

## Testing

Vitest, logic only (consistent with the repo; no component tests).

- `quote.test.ts`: bare-safe strings, spaces, single quotes, empty, leading `-`/`~`, unicode.
- `ref-name.test.ts`: each rule accepts a valid and rejects an invalid example with the right message.
- `catalog.test.ts` (integrity):
  - task ids unique and kebab-case; every category has at least one task;
  - every `related` and `saferAlternative.taskId` resolves;
  - every destructive step has a `warning`;
  - every task builds with sample values into non-empty steps, each part non-empty with a non-empty `explain`;
  - no part contains `HEAD^`.
- `catalog/<category>.test.ts`: table tests, values → exact command strings.
- `build.test.ts`: `resolveTask` statuses (ready / incomplete with placeholders / invalid).
- `search.test.ts`: "undo last commit" → `reset-soft` first; "uncommit", "delete branch", "discard changes",
  "force push" each return the expected task in the top 3.
