import type { ToolConfig } from "@/registry/types";

const gitignoreGenerator: ToolConfig = {
  id: "gitignore-generator",
  category: "developer",
  title: "Gitignore Generator",
  description: "Build a .gitignore for your stack from official templates for languages, frameworks, editors and operating systems.",
  keywords: [
    "gitignore",
    ".gitignore",
    "gitignore generator",
    "generate gitignore",
    "gitignore template",
    "combine gitignore files",
    "merge gitignore",
    "node gitignore",
    "python gitignore",
    "java gitignore",
    "go gitignore",
    "rust gitignore",
    "unity gitignore",
    "visual studio gitignore",
    "macos gitignore",
    "ds_store",
    "git ignore file",
    "ignore node_modules",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/developer/GitignoreGenerator"),
  consumes: ["text"],
  produces: ["gitignore"],
};

export default gitignoreGenerator;
