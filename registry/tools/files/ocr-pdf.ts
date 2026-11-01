import type { ToolConfig } from "@/registry/types";

const ocrPdf: ToolConfig = {
  id: "ocr-pdf",
  category: "files",
  title: "OCR PDF",
  description: "Make scanned PDFs searchable: text is recognised on your device and added invisibly, ready to select, copy and search.",
  keywords: ["ocr pdf", "searchable pdf", "scanned pdf to text", "pdf ocr", "make pdf searchable", "text recognition", "selectable text pdf", "scan to text"],
  actions: ["transform"],
  consumes: [],
  produces: [],
};

export default ocrPdf;
