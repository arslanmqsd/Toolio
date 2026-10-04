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
