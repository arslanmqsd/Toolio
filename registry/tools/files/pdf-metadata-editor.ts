import type { ToolConfig } from "@/registry/types";

const pdfMetadataEditor: ToolConfig = {
  id: "pdf-metadata-editor",
  category: "files",
  title: "PDF Metadata Editor",
  description: "View, edit or remove a PDF's title, author, keywords and dates. Runs in your browser; nothing is uploaded.",
  keywords: [
    "pdf metadata editor",
    "edit pdf metadata",
    "change pdf title",
    "pdf author",
    "remove pdf metadata",
    "pdf properties",
    "pdf document info",
    "pdf keywords",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/files/PdfMetadataEditor"),
  consumes: [],
  produces: [],
};

export default pdfMetadataEditor;
