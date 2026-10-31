import { serveWorkerTask } from "@/lib/worker-task";
import { applyEdits, type EditItem, type EditProgress } from "./pdf-editor";

export type PdfEditorRequest = { bytes: ArrayBuffer; items: EditItem[] };

// Off the main thread so large PDFs don't freeze the page.
serveWorkerTask<PdfEditorRequest, EditProgress, Uint8Array>((request, onProgress) => applyEdits(new Uint8Array(request.bytes), request.items, onProgress));
