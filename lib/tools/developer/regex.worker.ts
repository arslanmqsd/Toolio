import { findMatches, type WorkerRequest, type WorkerResponse } from "./regex-match";

// Runs matching off the main thread so a catastrophically backtracking
// pattern can be stopped (by terminating this worker) without freezing the page.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

ctx.onmessage = ({ data: { id, pattern, flags, text } }) => {
  try {
    ctx.postMessage({ id, ok: true, result: findMatches(pattern, flags, text) });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: (err as Error).message });
  }
};
