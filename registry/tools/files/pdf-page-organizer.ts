import type { ToolConfig } from "@/registry/types";

const pdfPageOrganizer: ToolConfig = {
  id: "pdf-page-organizer",
  category: "files",
  title: "PDF Page Organizer",
  description: "Reorder, rotate or delete PDF pages with previews, then save a new PDF. Runs in your browser; nothing is uploaded.",
  keywords: [
    "pdf page organizer",
    "reorder pdf pages",
    "rearrange pdf pages",
    "rotate pdf",
    "rotate pdf pages",
    "delete pdf pages",
    "remove pages from pdf",
    "organize pdf",
    "sort pdf pages",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/files/PdfPageOrganizer"),
  consumes: [],
  produces: [],
};

export default pdfPageOrganizer;
