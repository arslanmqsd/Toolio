import type { ToolConfig } from "@/registry/types";

const pdfCompressor: ToolConfig = {
  id: "pdf-compressor",
  category: "files",
  title: "PDF Compressor",
  description: "Reduce PDF file size in your browser by recompressing images. Text stays selectable and nothing is uploaded.",
  keywords: [
    "pdf compressor",
    "compress pdf",
    "reduce pdf size",
    "shrink pdf",
    "pdf size reducer",
    "make pdf smaller",
    "compress pdf for email",
    "optimize pdf",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/files/PdfCompressor"),
  consumes: [],
  produces: [],
};

export default pdfCompressor;
