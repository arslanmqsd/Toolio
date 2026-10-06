"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkerJobRequest, WorkerJobResponse } from "@/lib/worker-job";

export type WorkerJobState<Res> =
  | { status: "pending" }
  | { status: "done"; result: Res }
  | { status: "timeout" }
  | { status: "error"; error: string };

interface WorkerJobOptions {
  /** Stop the worker if it hasn't answered after this long, e.g. a regex stuck backtracking. */
  timeoutMs: number;
  /** Wait this long after the last change before sending, so typing doesn't queue a job per key. */
  debounceMs: number;
}

/**
 * Runs `request` in a Web Worker (one that answers with serveWorkerJobs) whenever it changes, so
 * slow or runaway work can be stopped without freezing the page. Pass null to send nothing. Memoize
 * `request`: a new object each render sends a new job each render.
 *
 * `createWorker` must call `new Worker(new URL("…", import.meta.url))` itself, in the component's
 * module, for the bundler to find the worker file.
 */
export function useWorkerJob<Req, Res>(
  createWorker: () => Worker,
  request: Req | null,
  { timeoutMs, debounceMs }: WorkerJobOptions,
): WorkerJobState<Res> {
  const [state, setState] = useState<WorkerJobState<Res>>({ status: "pending" });
  const workerRef = useRef<Worker | null>(null);
  const busyRef = useRef(false);
  const idRef = useRef(0);
  const createRef = useRef(createWorker);
  createRef.current = createWorker;

  useEffect(() => () => workerRef.current?.terminate(), []);

  useEffect(() => {
    if (request === null) return;
    const id = ++idRef.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const debounce = setTimeout(() => {
      // A busy worker may be stuck on an earlier job: replace it.
      if (busyRef.current) {
        workerRef.current?.terminate();
        workerRef.current = null;
      }
      const worker = workerRef.current ?? createRef.current();
      workerRef.current = worker;
      worker.onmessage = ({ data }: MessageEvent<WorkerJobResponse<Res>>) => {
        if (data.id !== idRef.current) return;
        busyRef.current = false;
        clearTimeout(timeout);
        setState(data.ok ? { status: "done", result: data.result } : { status: "error", error: data.error });
      };
      busyRef.current = true;
      worker.postMessage({ id, request } satisfies WorkerJobRequest<Req>);
      timeout = setTimeout(() => {
        if (id !== idRef.current) return;
        worker.terminate();
        workerRef.current = null;
        busyRef.current = false;
        setState({ status: "timeout" });
      }, timeoutMs);
    }, debounceMs);

    return () => {
      clearTimeout(debounce);
      clearTimeout(timeout);
    };
  }, [request, timeoutMs, debounceMs]);

  return state;
}
