import { serveWorkerTask } from "@/lib/worker-task";
import { countPages } from "./pdf-merge";
import { addPageNumbers, type PageNumberOptions, type PageNumbersProgress } from "./pdf-page-numbers";

export type PdfPageNumbersRequest = { kind: "count"; bytes: ArrayBuffer } | { kind: "number"; bytes: ArrayBuffer; options: PageNumberOptions; pages?: number[] };

// Off the main thread so large PDFs don't freeze the page.
serveWorkerTask<PdfPageNumbersRequest, PageNumbersProgress, number | Uint8Array>((request, onProgress) =>
  request.kind === "count"
    ? countPages(new Uint8Array(request.bytes))
    : addPageNumbers(new Uint8Array(request.bytes), request.options, request.pages, onProgress),
);
