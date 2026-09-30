import type { ToolConfig } from "@/registry/types";

const httpStatus: ToolConfig = {
  id: "http-status",
  category: "developer",
  title: "HTTP Status Codes",
  description: "Look up any HTTP status code: what it means, when you'll see it, and what to do.",
  keywords: [
    "http status",
    "status code",
    "http status code",
    "http error",
    "response code",
    "what does 404 mean",
    "what does 502 mean",
    "what does 500 mean",
    "404",
    "500",
    "502",
    "503",
    "429",
    "401 vs 403",
    "rate limited",
    "bad gateway",
    "gateway timeout",
    "not found error",
    "cloudflare error",
  ],
  actions: ["inspect"],
  component: () => import("@/components/tools/developer/HttpStatus"),
  consumes: [],
  produces: [],
};

export default httpStatus;
