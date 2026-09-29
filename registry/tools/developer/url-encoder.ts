import type { ToolConfig } from "@/registry/types";

const urlEncoder: ToolConfig = {
  id: "url-encoder",
  category: "developer",
  title: "URL Encoder",
  description: "Encode or decode URLs.",
  keywords: [
    "url encode",
    "url decode",
    "urlencode",
    "urldecode",
    "percent encoding",
    "percent encode",
    "encode a url",
    "decode a url",
    "escape url",
    "unescape url",
    "encodeuricomponent",
    "query string",
    "form urlencoded",
    "what does %20 mean",
    "parse url",
    "url query parameters",
  ],
  actions: ["convert", "inspect"],
  component: () => import("@/components/tools/developer/UrlEncoder"),
  consumes: ["text", "url"],
  produces: ["text", "url"],
};

export default urlEncoder;
