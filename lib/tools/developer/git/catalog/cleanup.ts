import { quote } from "@/lib/shell-quote";
import { escapeEre } from "../quote";
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
