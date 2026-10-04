import type { ToolConfig } from "@/registry/types";

const gitDiffViewer: ToolConfig = {
  id: "git-diff-viewer",
  category: "developer",
  title: "Git Diff Viewer",
  description: "Paste git diff output and read it file by file, with line numbers, changed words and syntax colors.",
  keywords: [
    "git diff",
    "git diff viewer",
    "paste git diff",
    "code diff viewer",
    "patch viewer",
    "view patch file",
    "git show",
    "diff viewer",
  ],
  actions: ["inspect"],
  component: () => import("@/components/tools/developer/GitDiffViewer"),
  consumes: ["diff", "text"],
  produces: [],
};

export default gitDiffViewer;
