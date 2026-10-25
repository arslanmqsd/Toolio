import type { ToolConfig } from "@/registry/types";

const findReplace: ToolConfig = {
  id: "find-replace",
  category: "text",
  title: "Find and Replace",
  description: "Find and replace text in bulk, with match case, whole words and regular expressions with capture groups.",
  keywords: [
    "find and replace",
    "find replace",
    "search and replace",
    "replace text",
    "replace words",
    "bulk replace",
    "regex replace",
    "replace online",
    "text replacer",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/text/FindReplace"),
  consumes: ["text"],
  produces: ["text"],
};

export default findReplace;
