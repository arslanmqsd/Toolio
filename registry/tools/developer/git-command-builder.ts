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
