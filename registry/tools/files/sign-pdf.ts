import type { ToolConfig } from "@/registry/types";

const signPdf: ToolConfig = {
  id: "sign-pdf",
  category: "files",
  title: "Sign PDF",
  description: "Sign a PDF: draw, type or upload your signature, then add initials, your name and the date. Runs in your browser.",
  keywords: ["sign pdf", "esign", "e-sign", "electronic signature", "signature", "sign document", "add signature to pdf", "initials", "fill and sign"],
  actions: ["transform"],
  consumes: [],
  produces: [],
};

export default signPdf;
