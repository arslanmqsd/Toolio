import createModule, { type QpdfInstance } from "@neslinesli93/qpdf-wasm";
import { serveWorkerTask } from "@/lib/worker-task";
import { protectPdf } from "./pdf-protect";

export type PdfProtectRequest = { bytes: ArrayBuffer; password: string };

// Loaded on first use, so the 1.3 MB WebAssembly downloads only when someone protects a file.
let qpdf: Promise<QpdfInstance> | null = null;
const load = () => (qpdf ??= createModule({ locateFile: () => new URL("@neslinesli93/qpdf-wasm/dist/qpdf.wasm", import.meta.url).href }));

serveWorkerTask<PdfProtectRequest, never, Uint8Array>(async (request) => protectPdf(await load(), new Uint8Array(request.bytes), request.password));
