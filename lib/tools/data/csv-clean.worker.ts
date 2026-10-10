import { serveWorkerJobs } from "@/lib/worker-job";
import { cleanCsv, type CsvCleanRequest } from "./csv-clean";

// Off the main thread so typing stays smooth on a large file, and a run that goes on too long can be stopped.
serveWorkerJobs((request: CsvCleanRequest) => cleanCsv(request.text, request.options));
