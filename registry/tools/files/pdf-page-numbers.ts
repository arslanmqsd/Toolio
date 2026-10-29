import type { ToolConfig } from "@/registry/types";

const pdfPageNumbers: ToolConfig = {
  id: "pdf-page-numbers",
  category: "files",
  title: "Add PDF Page Numbers",
  description: "Number PDF pages with your choice of position, margin, format, font and size. Runs in your browser.",
  keywords: [
    "add page numbers to pdf",
    "pdf page numbers",
    "number pdf pages",
    "pdf pagination",
    "page x of y pdf",
    "insert page numbers",
    "pdf footer page number",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/files/PdfPageNumbers"),
  consumes: [],
  produces: [],
};

export default pdfPageNumbers;
