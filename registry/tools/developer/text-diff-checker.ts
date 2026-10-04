import type { ToolConfig } from "@/registry/types";

const textDiffChecker: ToolConfig = {
  id: "text-diff-checker",
  category: "developer",
  title: "Text Diff Checker",
  description: "Compare two texts or files and see every changed line and word, side by side or as a patch.",
  keywords: [
    "diff checker",
    "text diff",
    "compare text",
    "compare two files",
    "text compare",
    "find differences",
    "compare code",
    "diff online",
    "create patch",
  ],
  actions: ["compare"],
  component: () => import("@/components/tools/developer/TextDiffChecker"),
  consumes: ["text", "code"],
  produces: ["diff"],
};

export default textDiffChecker;
