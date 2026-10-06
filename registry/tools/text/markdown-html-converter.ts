import type { ToolConfig } from "@/registry/types";

const markdownHtmlConverter: ToolConfig = {
  id: "markdown-html-converter",
  category: "text",
  title: "Markdown to HTML Converter",
  description: "Convert Markdown to HTML and HTML to Markdown, with a safe live preview.",
  keywords: [
    "markdown to html",
    "html to markdown",
    "md to html",
    "html to md",
    "md converter",
    "markdown converter",
    "markdown preview",
    "readme preview",
    "gfm converter",
    "github flavored markdown",
    "convert html to markdown",
  ],
  actions: ["convert", "transform"],
  component: () => import("@/components/tools/text/MarkdownHtmlConverter"),
  consumes: ["markdown", "html"],
  produces: ["markdown", "html"],
};

export default markdownHtmlConverter;
