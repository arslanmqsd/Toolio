import type { ToolConfig } from "@/registry/types";

const pdfToText: ToolConfig = {
  id: "pdf-to-text",
  category: "files",
  title: "PDF to Text",
  description: "Pull the text out of a PDF to copy or save as a TXT file, keeping lines and paragraphs. Runs in your browser.",
  keywords: [
    "pdf to text",
    "pdf to txt",
    "extract text from pdf",
    "copy text from pdf",
    "pdf text extractor",
    "convert pdf to text",
    "pdf to plain text",
  ],
  actions: ["extract"],
  component: () => import("@/components/tools/files/PdfToText"),
  consumes: [],
  produces: ["text"],
};

export default pdfToText;
