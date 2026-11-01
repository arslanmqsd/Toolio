import type { ToolConfig } from "@/registry/types";

const redactPdf: ToolConfig = {
  id: "redact-pdf",
  category: "files",
  title: "Redact PDF",
  description: "Black out names, numbers and other sensitive content in a PDF, removed for good, not just covered.",
  keywords: ["redact pdf", "pdf redaction", "black out text in pdf", "remove sensitive information from pdf", "hide text in pdf", "censor pdf", "anonymize pdf"],
  actions: ["transform"],
  consumes: [],
  produces: [],
};

export default redactPdf;
