import { LEVELS, browserImageEncoder, compressPdf, type CompressProgress, type CompressResult, type LevelId } from "./pdf-compress";

export type PdfJobRequest = { bytes: ArrayBuffer; level: LevelId };
export type PdfJobMessage = { type: "progress"; progress: CompressProgress } | { type: "done"; result: CompressResult } | { type: "error"; error: string };

// Off the main thread so a large PDF doesn't freeze the page, and so it can be cancelled by terminating the worker.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<PdfJobRequest>) => void) | null;
  postMessage: (message: PdfJobMessage) => void;
};

ctx.onmessage = async ({ data: { bytes, level } }) => {
  try {
    const result = await compressPdf(new Uint8Array(bytes), LEVELS[level], browserImageEncoder, (progress) => ctx.postMessage({ type: "progress", progress }));
    ctx.postMessage({ type: "done", result });
  } catch (err) {
    ctx.postMessage({ type: "error", error: (err as Error).message });
  }
};
