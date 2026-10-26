import { serveWorkerTask } from "@/lib/worker-task";
import { countPages } from "./pdf-merge";
import { watermarkPdf, type WatermarkOptions, type WatermarkProgress } from "./pdf-watermark";

export type PdfWatermarkRequest = { kind: "count"; bytes: ArrayBuffer } | { kind: "watermark"; bytes: ArrayBuffer; options: WatermarkOptions; pages?: number[] };

// Off the main thread so large PDFs don't freeze the page.
serveWorkerTask<PdfWatermarkRequest, WatermarkProgress, number | Uint8Array>((request, onProgress) =>
  request.kind === "count"
    ? countPages(new Uint8Array(request.bytes))
    : watermarkPdf(new Uint8Array(request.bytes), request.options, request.pages, onProgress),
);
