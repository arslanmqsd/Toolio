import { serveWorkerJobs } from "@/lib/worker-job";
import { convertJsonCsv, type JsonCsvRequest } from "./json-csv";

// Off the main thread so typing stays smooth on a large file, and a run that goes on too long can be stopped.
serveWorkerJobs((request: JsonCsvRequest) => convertJsonCsv(request));
