import { serveWorkerTask } from "@/lib/worker-task";
import { LEVELS, browserImageEncoder, compressPdf, type CompressProgress, type CompressResult, type LevelId } from "./pdf-compress";

export type PdfCompressRequest = { bytes: ArrayBuffer; level: LevelId };

// Off the main thread so a large PDF doesn't freeze the page, and so it can be cancelled.
serveWorkerTask<PdfCompressRequest, CompressProgress, CompressResult>(({ bytes, level }, onProgress) =>
  compressPdf(new Uint8Array(bytes), LEVELS[level], browserImageEncoder, onProgress),
);
