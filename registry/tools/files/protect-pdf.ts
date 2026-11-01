import type { ToolConfig } from "@/registry/types";

const protectPdf: ToolConfig = {
  id: "protect-pdf",
  category: "files",
  title: "Protect PDF",
  description: "Lock a PDF with a password using AES-256 encryption, so only people with the password can open it.",
  keywords: ["protect pdf", "password protect pdf", "encrypt pdf", "lock pdf", "add password to pdf", "secure pdf", "pdf password"],
  actions: ["transform"],
  consumes: [],
  produces: [],
};

export default protectPdf;
