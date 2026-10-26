import { serveWorkerTask } from "@/lib/worker-task";
import { countPages } from "./pdf-merge";
import { organizePages, type PageEdit } from "./pdf-organize";

export type PdfOrganizeRequest = { kind: "count"; bytes: ArrayBuffer } | { kind: "organize"; bytes: ArrayBuffer; edits: PageEdit[] };

// Off the main thread so large PDFs don't freeze the page. "count" also checks pdf-lib can edit the
// file: pdf.js can preview some password-protected PDFs that pdf-lib can't save.
serveWorkerTask<PdfOrganizeRequest, never, number | Uint8Array>((request) =>
  request.kind === "count" ? countPages(new Uint8Array(request.bytes)) : organizePages(new Uint8Array(request.bytes), request.edits),
);
