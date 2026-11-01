import type { ToolConfig } from "@/registry/types";

const htmlToPdf: ToolConfig = {
  id: "html-to-pdf",
  category: "files",
  title: "HTML to PDF",
  description: "Turn HTML into a PDF with your browser's own print engine: real text, exact CSS, your page size and margins.",
  keywords: ["html to pdf", "convert html to pdf", "web page to pdf", "save html as pdf", "print html", "html pdf converter", "invoice html to pdf"],
  actions: ["transform"],
  consumes: ["html"],
  produces: [],
};

export default htmlToPdf;
