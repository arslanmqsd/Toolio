import { serveWorkerTask } from "@/lib/worker-task";
import { cropPages, type PageCrop } from "./pdf-crop";

export type PdfCropRequest = { bytes: ArrayBuffer; crops: PageCrop[] };

// Off the main thread so large PDFs don't freeze the page.
serveWorkerTask<PdfCropRequest, never, Uint8Array>((request) => cropPages(new Uint8Array(request.bytes), request.crops));
