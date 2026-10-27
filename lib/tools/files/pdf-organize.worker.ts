import { serveWorkerTask } from "@/lib/worker-task";
import { countPages } from "./pdf-merge";
import { organizePages, rotatePdf, type PageEdit } from "./pdf-organize";

export type PdfOrganizeRequest =
  | { kind: "count"; bytes: ArrayBuffer }
  | { kind: "organize"; bytes: ArrayBuffer; edits: PageEdit[] }
  | { kind: "rotate"; bytes: ArrayBuffer; turns: number };

// Off the main thread so large PDFs don't freeze the page. "count" also checks pdf-lib can edit the
// file: pdf.js can preview some password-protected PDFs that pdf-lib can't save.
serveWorkerTask<PdfOrganizeRequest, never, number | Uint8Array>((request) => {
  const bytes = new Uint8Array(request.bytes);
  if (request.kind === "count") return countPages(bytes);
  return request.kind === "organize" ? organizePages(bytes, request.edits) : rotatePdf(bytes, request.turns);
});
