import type { ToolConfig } from "@/registry/types";

const cropPdf: ToolConfig = {
  id: "crop-pdf",
  category: "files",
  title: "Crop PDF",
  description: "Crop PDF pages or trim their white margins, on every page or just one, with a live preview.",
  keywords: ["crop pdf", "trim pdf margins", "pdf cropper", "resize pdf pages", "cut pdf margins", "remove white margins pdf", "crop pdf page"],
  actions: ["transform"],
  consumes: [],
  produces: [],
};

export default cropPdf;
