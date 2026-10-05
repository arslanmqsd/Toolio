import type { ToolConfig } from "@/registry/types";

const urlParser: ToolConfig = {
  id: "url-parser",
  category: "developer",
  title: "URL Parser",
  description: "Break a URL into its protocol, host, path, query parameters and fragment, then edit and rebuild it.",
  keywords: [
    "url parser",
    "parse url",
    "inspect url",
    "url component breakdown",
    "url query parameters",
    "query parameter parser",
    "query string parser",
    "decode url parameters",
    "oauth callback url",
    "redirect url",
    "url builder",
    "normalize url",
    "relative url resolver",
  ],
  actions: ["inspect", "transform", "format"],
  component: () => import("@/components/tools/developer/UrlParser"),
  consumes: ["url"],
  produces: ["url"],
};

export default urlParser;
