import type { ToolConfig } from "@/registry/types";

const jsonFormatter: ToolConfig = {
  id: "json-formatter",
  category: "developer",
  title: "JSON Formatter",
  description: "Format, validate, and inspect JSON.",
  keywords: [
    "json formatter",
    "format json",
    "prettify json",
    "beautify json",
    "pretty print json",
    "validate json",
    "json validator",
    "json lint",
    "is my json valid",
    "find json syntax error",
    "fix invalid json",
    "minify json",
    "compact json",
    "sort json keys",
    "inspect json",
    "json viewer",
  ],
  actions: ["format", "inspect", "transform"],
  component: () => import("@/components/tools/developer/JsonFormatter"),
  consumes: ["json"],
  produces: ["json"],
};

export default jsonFormatter;
