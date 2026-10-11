import type { ToolConfig } from "@/registry/types";

const caseConverter: ToolConfig = {
  id: "case-converter",
  category: "text",
  title: "Case Converter",
  description: "Convert text to Title Case, Sentence case, UPPER, lower, camelCase, snake_case, kebab-case and more, line by line.",
  keywords: [
    "case converter",
    "text case converter",
    "title case converter",
    "sentence case",
    "uppercase to lowercase",
    "lowercase to uppercase",
    "camelcase converter",
    "snake case converter",
    "kebab case",
    "pascal case",
    "constant case",
    "change case",
    "capitalize words",
  ],
  actions: ["convert"],
  component: () => import("@/components/tools/text/CaseConverter"),
  consumes: ["text"],
  produces: ["text"],
};

export default caseConverter;
