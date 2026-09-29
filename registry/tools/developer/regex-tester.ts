import type { ToolConfig } from "@/registry/types";

const regexTester: ToolConfig = {
  id: "regex-tester",
  category: "developer",
  title: "Regex Tester",
  description: "Test a regular expression against text and get a plain-English explanation of every part.",
  keywords: [
    "regex",
    "regexp",
    "regular expression",
    "regex tester",
    "test regex",
    "test a regular expression",
    "regex explainer",
    "explain regex",
    "what does this regex mean",
    "debug regex",
    "regex matches",
    "find matches with regex",
    "capture groups",
    "named groups",
    "javascript regex",
  ],
  actions: ["inspect", "extract"],
  component: () => import("@/components/tools/developer/RegexTester"),
  consumes: ["regex", "text"],
  produces: ["json"],
};

export default regexTester;
