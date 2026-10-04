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
