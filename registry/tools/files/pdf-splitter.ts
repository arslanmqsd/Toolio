import type { ToolConfig } from "@/registry/types";

const pdfSplitter: ToolConfig = {
  id: "pdf-splitter",
  category: "files",
  title: "PDF Splitter",
  description: "Extract selected pages from a PDF, or split it into one file per page range, in your browser. Nothing is uploaded.",
  keywords: [
    "pdf splitter",
    "split pdf",
    "extract pdf pages",
    "extract pages from pdf",
    "separate pdf pages",
    "pdf page extractor",
    "remove pages from pdf",
    "save pdf pages",
  ],
  actions: ["extract"],
  component: () => import("@/components/tools/files/PdfSplitter"),
  consumes: [],
  produces: [],
};

export default pdfSplitter;
