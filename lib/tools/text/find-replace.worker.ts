import { serveWorkerJobs } from "@/lib/worker-job";
import { findReplace, type FindReplaceRequest } from "./find-replace";

// Off the main thread so a regex stuck backtracking can be stopped without freezing the page.
serveWorkerJobs((request: FindReplaceRequest) => findReplace(request));
