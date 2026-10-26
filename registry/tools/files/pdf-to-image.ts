import type { ToolConfig } from "@/registry/types";

const pdfToImage: ToolConfig = {
  id: "pdf-to-image",
  category: "files",
  title: "PDF to JPG / PNG",
  description: "Turn PDF pages into JPG or PNG images at the resolution you pick. Runs in your browser; nothing is uploaded.",
  keywords: [
    "pdf to jpg",
    "pdf to png",
    "pdf to image",
    "pdf to jpeg",
    "convert pdf to image",
    "pdf page to picture",
    "export pdf pages as images",
    "rasterize pdf",
  ],
  actions: ["convert"],
  component: () => import("@/components/tools/files/PdfToImage"),
  consumes: [],
  produces: [],
};

export default pdfToImage;
