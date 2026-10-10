import { serveWorkerJobs } from "@/lib/worker-job";
import { processXml, type XmlRequest } from "./xml-format";

// Off the main thread so typing stays smooth on a large file, and a run that goes on too long can be stopped.
serveWorkerJobs((request: XmlRequest) => processXml(request));
