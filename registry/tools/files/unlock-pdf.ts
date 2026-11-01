import type { ToolConfig } from "@/registry/types";

const unlockPdf: ToolConfig = {
  id: "unlock-pdf",
  category: "files",
  title: "Unlock PDF",
  description: "Remove a PDF's password and its printing, copying and editing restrictions, using the password you know.",
  keywords: ["unlock pdf", "remove pdf password", "decrypt pdf", "pdf password remover", "remove pdf restrictions", "unsecure pdf"],
  actions: ["transform"],
  consumes: [],
  produces: [],
};

export default unlockPdf;
