import type { ToolConfig } from "@/registry/types";

const pdfWatermark: ToolConfig = {
  id: "pdf-watermark",
  category: "files",
  title: "PDF Watermark",
  description: "Stamp text like CONFIDENTIAL or DRAFT across PDF pages, once or repeated. Runs in your browser; nothing is uploaded.",
  keywords: [
    "pdf watermark",
    "watermark pdf",
    "add watermark to pdf",
    "stamp pdf",
    "confidential stamp",
    "draft watermark",
    "pdf text overlay",
  ],
  actions: ["transform"],
  component: () => import("@/components/tools/files/PdfWatermark"),
  consumes: [],
  produces: [],
};

export default pdfWatermark;
