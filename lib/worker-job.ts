/** Messages between useWorkerJob and a worker that answers with serveWorkerJobs. */
export type WorkerJobRequest<Req> = { id: number; request: Req };
export type WorkerJobResponse<Res> = { id: number } & ({ ok: true; result: Res } | { ok: false; error: string });

/** Worker side: answers each request with `run`'s result, or the message of what it threw or rejected with. */
export function serveWorkerJobs<Req, Res>(run: (request: Req) => Res | Promise<Res>): void {
  const ctx = self as unknown as {
    onmessage: ((event: MessageEvent<WorkerJobRequest<Req>>) => void) | null;
    postMessage: (message: WorkerJobResponse<Res>) => void;
  };
  ctx.onmessage = async ({ data: { id, request } }) => {
    try {
      ctx.postMessage({ id, ok: true, result: await run(request) });
    } catch (err) {
      ctx.postMessage({ id, ok: false, error: (err as Error).message });
    }
  };
}
