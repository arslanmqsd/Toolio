import { describe, expect, it, vi } from "vitest";
import { runWorkerTask, type WorkerTaskMessage } from "./worker-task";

/** Stands in for a Worker: `reply` decides what it sends back for each request. */
function fakeWorker(reply: (request: unknown, send: (message: WorkerTaskMessage<number, string>) => void, crash: () => void) => void) {
  const worker = {
    onmessage: null as ((event: { data: WorkerTaskMessage<number, string> }) => void) | null,
    onerror: null as (() => void) | null,
    terminate: vi.fn(),
    postMessage: vi.fn((request: unknown) =>
      queueMicrotask(() =>
        reply(
          request,
          (data) => worker.onmessage?.({ data }),
          () => worker.onerror?.(),
        ),
      ),
    ),
  };
  return worker;
}

const run = (worker: ReturnType<typeof fakeWorker>, onProgress?: (p: number) => void) =>
  runWorkerTask<string, number, string>(() => worker as unknown as Worker, "hello", { onProgress });

describe("runWorkerTask", () => {
  it("passes progress along, resolves with the result and stops the worker", async () => {
    const worker = fakeWorker((request, send) => {
      send({ type: "progress", progress: 0.5 });
      send({ type: "done", result: `got ${request}` });
    });
    const progress: number[] = [];
    await expect(run(worker, (p) => progress.push(p)).result).resolves.toBe("got hello");
    expect(progress).toEqual([0.5]);
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("rejects with the worker's error message", async () => {
    const worker = fakeWorker((_, send) => send({ type: "error", error: "bad file" }));
    await expect(run(worker).result).rejects.toThrow("bad file");
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("reports a crashed worker as out of memory", async () => {
    const worker = fakeWorker((_, __, crash) => crash());
    await expect(run(worker).result).rejects.toThrow("out of memory");
  });

  it("stops the worker and rejects as cancelled", async () => {
    const worker = fakeWorker(() => {});
    const task = run(worker);
    task.cancel();
    await expect(task.result).rejects.toThrow("cancelled");
    expect(worker.terminate).toHaveBeenCalled();
  });
});
