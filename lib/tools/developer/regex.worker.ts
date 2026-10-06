import { serveWorkerJobs } from "@/lib/worker-job";
import { findMatches, type MatchRequest } from "./regex-match";

// Runs matching off the main thread so a catastrophically backtracking
// pattern can be stopped (by terminating this worker) without freezing the page.
serveWorkerJobs(({ pattern, flags, text }: MatchRequest) => findMatches(pattern, flags, text));
