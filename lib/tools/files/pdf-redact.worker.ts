import { serveWorkerTask } from "@/lib/worker-task";
import type { EditProgress } from "./pdf-editor";
import { redactPages, type FlatPage } from "./pdf-redact";

export type PdfRedactRequest = { bytes: ArrayBuffer; pages: FlatPage[] };

// Off the main thread so large PDFs don't freeze the page.
serveWorkerTask<PdfRedactRequest, EditProgress, Uint8Array>((request, onProgress) => redactPages(new Uint8Array(request.bytes), request.pages, onProgress));
