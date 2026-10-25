import { serveWorkerTask } from "@/lib/worker-task";
import { countPages, mergePdfs, type MergeProgress } from "./pdf-merge";

export type PdfMergeRequest = { kind: "count"; bytes: ArrayBuffer } | { kind: "merge"; files: ArrayBuffer[] };

// Off the main thread so opening and joining large PDFs doesn't freeze the page.
serveWorkerTask<PdfMergeRequest, MergeProgress, number | Uint8Array>((request, onProgress) =>
  request.kind === "count" ? countPages(new Uint8Array(request.bytes)) : mergePdfs(request.files.map((f) => new Uint8Array(f)), onProgress),
);
