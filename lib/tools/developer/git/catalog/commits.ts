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
