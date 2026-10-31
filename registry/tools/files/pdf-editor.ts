import type { ToolConfig } from "@/registry/types";

const pdfEditor: ToolConfig = {
  id: "pdf-editor",
  category: "files",
  title: "PDF Editor",
  description: "Add text, highlights, shapes and comments to a PDF. Runs in your browser, so your file never leaves your device.",
  keywords: [
    "edit pdf",
    "pdf editor",
    "add text to pdf",
    "highlight pdf",
    "annotate pdf",
    "comment on pdf",
    "draw on pdf",
    "write on pdf",
    "pdf sticky note",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/files/PdfEditor"),
  consumes: [],
  produces: [],
};

export default pdfEditor;
