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
