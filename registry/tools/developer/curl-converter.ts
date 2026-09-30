import type { ToolConfig } from "@/registry/types";

const curlConverter: ToolConfig = {
  id: "curl-converter",
  category: "developer",
  title: "cURL Converter",
  description: "Turn a curl command into JavaScript fetch, Axios, or Python requests code.",
  keywords: [
    "curl",
    "curl converter",
    "convert curl",
    "curl to fetch",
    "curl to javascript",
    "curl to axios",
    "curl to python",
    "curl to requests",
    "copy as curl",
    "turn curl into code",
    "http request code",
    "api request snippet",
    "translate curl command",
  ],
  actions: ["convert", "generate"],
  component: () => import("@/components/tools/developer/CurlConverter"),
  consumes: ["curl"],
  produces: ["code"],
};

export default curlConverter;
