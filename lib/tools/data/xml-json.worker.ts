import { serveWorkerJobs } from "@/lib/worker-job";
import { convertXmlJson, type XmlJsonRequest } from "./xml-json";

// Off the main thread so typing stays smooth on a large file, and a run that goes on too long can be stopped.
serveWorkerJobs((request: XmlJsonRequest) => convertXmlJson(request));
