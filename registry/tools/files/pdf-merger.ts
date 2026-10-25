import type { ToolConfig } from "@/registry/types";

const pdfMerger: ToolConfig = {
  id: "pdf-merger",
  category: "files",
  title: "PDF Merger",
  description: "Combine multiple PDFs into one file in your browser. Put them in any order; nothing is uploaded.",
  keywords: [
    "pdf merger",
    "merge pdf",
    "combine pdf",
    "join pdf",
    "merge pdf files",
    "combine pdf files into one",
    "pdf joiner",
    "append pdf",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/files/PdfMerger"),
  consumes: [],
  produces: [],
};

export default pdfMerger;
