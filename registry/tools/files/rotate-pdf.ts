import type { ToolConfig } from "@/registry/types";

const rotatePdf: ToolConfig = {
  id: "rotate-pdf",
  category: "files",
  title: "Rotate PDF",
  description: "Turn every page of one or many PDFs left, right or upside down, then save. Runs in your browser.",
  keywords: [
    "rotate pdf",
    "turn pdf",
    "rotate pdf pages",
    "rotate multiple pdfs",
    "flip pdf",
    "pdf sideways",
    "pdf upside down",
    "batch rotate pdf",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/files/RotatePdf"),
  consumes: [],
  produces: [],
};

export default rotatePdf;
