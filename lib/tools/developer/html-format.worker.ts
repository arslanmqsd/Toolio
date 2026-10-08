import { serveWorkerJobs } from "@/lib/worker-job";
import { processHtml, type HtmlRequest } from "./html-format";

// Off the main thread: Prettier and the minifier are big and can take a while on a large page,
// and a page that sends them into a long run can be stopped by terminating this worker.
serveWorkerJobs((request: HtmlRequest) => processHtml(request));
