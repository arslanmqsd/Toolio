import type { ToolConfig } from "@/registry/types";

const htmlFormatter: ToolConfig = {
  id: "html-formatter",
  category: "developer",
  title: "HTML Formatter",
  description: "Format or minify HTML without changing how it renders, see the size saved, and preview the page safely.",
  keywords: [
    "html formatter",
    "format html",
    "beautify html",
    "prettify html",
    "pretty print html",
    "indent html",
    "html minifier",
    "minify html",
    "compress html",
    "html viewer",
    "view html",
    "html preview",
    "render html",
    "html beautifier",
  ],
  actions: ["format", "transform"],
  component: () => import("@/components/tools/developer/HtmlFormatter"),
  consumes: ["html"],
  produces: ["html"],
};

export default htmlFormatter;
