import { serveWorkerTask } from "@/lib/worker-task";
import { readMetadata, writeMetadata, type PdfMetadata, type ReadMetadata } from "./pdf-metadata";

export type PdfMetadataRequest = { kind: "read"; bytes: ArrayBuffer } | { kind: "write"; bytes: ArrayBuffer; metadata: PdfMetadata };

// Off the main thread so opening and saving large PDFs doesn't freeze the page.
serveWorkerTask<PdfMetadataRequest, never, ReadMetadata | Uint8Array>((request) =>
  request.kind === "read" ? readMetadata(new Uint8Array(request.bytes)) : writeMetadata(new Uint8Array(request.bytes), request.metadata),
);
