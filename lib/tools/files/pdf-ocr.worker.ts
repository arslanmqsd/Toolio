import { serveWorkerTask } from "@/lib/worker-task";
import { addTextLayers, type TextLayer } from "./pdf-ocr";

export type PdfOcrRequest = { bytes: ArrayBuffer; layers: TextLayer[] };

// Off the main thread so large PDFs don't freeze the page.
serveWorkerTask<PdfOcrRequest, never, Uint8Array>((request) => addTextLayers(new Uint8Array(request.bytes), request.layers));
