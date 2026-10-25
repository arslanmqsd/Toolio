import { serveWorkerTask } from "@/lib/worker-task";
import { countPages } from "./pdf-merge";
import { extractPages, type SplitProgress } from "./pdf-split";

export type PdfSplitRequest = { kind: "count"; bytes: ArrayBuffer } | { kind: "split"; bytes: ArrayBuffer; groups: number[][] };

// Off the main thread so opening and copying pages of a large PDF doesn't freeze the page.
serveWorkerTask<PdfSplitRequest, SplitProgress, number | Uint8Array[]>((request, onProgress) =>
  request.kind === "count" ? countPages(new Uint8Array(request.bytes)) : extractPages(new Uint8Array(request.bytes), request.groups, onProgress),
);
