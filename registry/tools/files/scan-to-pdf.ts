import type { ToolConfig } from "@/registry/types";

const scanToPdf: ToolConfig = {
  id: "scan-to-pdf",
  category: "files",
  title: "Scan to PDF",
  description: "Scan pages with your phone's camera and they appear on your computer, ready to save as one PDF. Encrypted on the way.",
  keywords: ["scan to pdf", "phone scanner", "scan document", "camera to pdf", "mobile scan", "document scanner", "photo to pdf", "scan with phone"],
  actions: ["transform"],
  consumes: [],
  produces: [],
};

export default scanToPdf;
