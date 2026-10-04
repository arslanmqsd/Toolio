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
