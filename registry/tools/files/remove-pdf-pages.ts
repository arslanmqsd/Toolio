import type { ToolConfig } from "@/registry/types";

const removePdfPages: ToolConfig = {
  id: "remove-pdf-pages",
  category: "files",
  title: "Remove PDF Pages",
  description: "Pick the pages you don't need, by clicking or by number, and get a new PDF without them.",
  keywords: ["remove pdf pages", "delete pdf pages", "remove pages from pdf", "delete pages from pdf", "drop pdf pages", "cut pages from pdf"],
  actions: ["transform"],
  consumes: [],
  produces: [],
};

export default removePdfPages;
