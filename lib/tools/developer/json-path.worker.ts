import { serveWorkerJobs } from "@/lib/worker-job";
import { evaluateJsonPath } from "./json-path";

// Off the main thread: big documents parse without blocking typing, and a filter regex that
// backtracks forever can be stopped by terminating this worker.
serveWorkerJobs(({ text, path }: { text: string; path: string }) => evaluateJsonPath(text, path));
