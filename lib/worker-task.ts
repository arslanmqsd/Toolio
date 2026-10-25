/**
 * One-off jobs in a Web Worker that report progress, for work on files too slow for the main thread.
 * Unlike useWorkerJob (debounced, for text typed live), each task gets its own worker, so cancelling
 * is just terminating it.
 */

export type WorkerTaskMessage<Progress, Result> =
  | { type: "progress"; progress: Progress }
  | { type: "done"; result: Result }
  | { type: "error"; error: string };

export interface WorkerTask<Result> {
  /** Rejects with the worker's error message, or "cancelled" after cancel(). */
  result: Promise<Result>;
  cancel: () => void;
}

/** Page side: sends `request` to a new worker from `createWorker` and settles with its answer. */
export function runWorkerTask<Request, Progress, Result>(
  createWorker: () => Worker,
  request: Request,
  { transfer = [], onProgress }: { transfer?: Transferable[]; onProgress?: (progress: Progress) => void } = {},
): WorkerTask<Result> {
  const worker = createWorker();
  let reject: (error: Error) => void = () => {};
  const result = new Promise<Result>((resolve, rejectPromise) => {
    reject = rejectPromise;
    worker.onmessage = ({ data }: MessageEvent<WorkerTaskMessage<Progress, Result>>) => {
      if (data.type === "progress") return onProgress?.(data.progress);
      worker.terminate();
      if (data.type === "done") resolve(data.result);
      else rejectPromise(new Error(data.error));
    };
    // Fires when the worker itself dies, usually from running out of memory on a huge file.
    worker.onerror = () => {
      worker.terminate();
      rejectPromise(new Error("out of memory"));
    };
  });
  worker.postMessage(request, transfer);
  return {
    result,
    cancel: () => {
      worker.terminate();
      reject(new Error("cancelled"));
    },
  };
}

/** Worker side: answers the request with `run`'s result, passing progress along as it goes. */
export function serveWorkerTask<Request, Progress, Result>(run: (request: Request, onProgress: (progress: Progress) => void) => Promise<Result>): void {
  const ctx = self as unknown as {
    onmessage: ((event: MessageEvent<Request>) => void) | null;
    postMessage: (message: WorkerTaskMessage<Progress, Result>) => void;
  };
  ctx.onmessage = async ({ data }) => {
    try {
      ctx.postMessage({ type: "done", result: await run(data, (progress) => ctx.postMessage({ type: "progress", progress })) });
    } catch (err) {
      ctx.postMessage({ type: "error", error: (err as Error).message });
    }
  };
}
