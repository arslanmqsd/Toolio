import createModule, { type QpdfInstance } from "@neslinesli93/qpdf-wasm";
import { serveWorkerTask } from "@/lib/worker-task";
import { lockOf, protectPdf, unlockPdf, type Lock } from "./pdf-protect";

export type PdfProtectRequest =
  | { kind: "protect"; bytes: ArrayBuffer; password: string }
  | { kind: "unlock"; bytes: ArrayBuffer; password: string }
  | { kind: "lock"; bytes: ArrayBuffer };

// Loaded on first use, so the 1.3 MB WebAssembly downloads only when someone protects or unlocks a file.
let qpdf: Promise<QpdfInstance> | null = null;
const load = () =>
  (qpdf ??= (async () => {
    // Quiet: a wrong-password check is expected, and qpdf's "invalid password" would look like an error in the
    // console. This build ignores print/printErr and keeps the console functions it finds at startup.
    const { log, error } = console;
    console.log = console.error = () => {};
    try {
      return await createModule({ locateFile: () => new URL("@neslinesli93/qpdf-wasm/dist/qpdf.wasm", import.meta.url).href });
    } finally {
      Object.assign(console, { log, error });
    }
  })());

serveWorkerTask<PdfProtectRequest, never, Uint8Array | Lock>(async (request) => {
  const bytes = new Uint8Array(request.bytes);
  const q = await load();
  if (request.kind === "lock") return lockOf(q, bytes);
  return request.kind === "protect" ? protectPdf(q, bytes, request.password) : unlockPdf(q, bytes, request.password);
});
