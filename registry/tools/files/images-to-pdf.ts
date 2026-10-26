import type { ToolConfig } from "@/registry/types";

const imagesToPdf: ToolConfig = {
  id: "images-to-pdf",
  category: "files",
  title: "Images to PDF",
  description: "Turn JPG, PNG and other images into one PDF, a page each, in any order. Runs in your browser; nothing is uploaded.",
  keywords: [
    "images to pdf",
    "jpg to pdf",
    "png to pdf",
    "image to pdf",
    "photo to pdf",
    "convert images to pdf",
    "combine images into pdf",
    "webp to pdf",
  ],
  actions: ["convert"],
  component: () => import("@/components/tools/files/ImagesToPdf"),
  consumes: [],
  produces: [],
};

export default imagesToPdf;
