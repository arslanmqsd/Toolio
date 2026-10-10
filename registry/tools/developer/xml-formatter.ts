import type { ToolConfig } from "@/registry/types";

const xmlFormatter: ToolConfig = {
  id: "xml-formatter",
  category: "developer",
  title: "XML Formatter & Validator",
  description: "Check that XML is well-formed, see exactly where it isn't, and format or minify it without changing its text.",
  keywords: [
    "xml formatter",
    "format xml",
    "xml validator",
    "validate xml",
    "xml checker",
    "well-formed xml",
    "xml beautifier",
    "beautify xml",
    "prettify xml",
    "pretty print xml",
    "indent xml",
    "xml minifier",
    "minify xml",
    "xml viewer",
    "xml lint",
  ],
  actions: ["format", "inspect", "transform"],
  component: () => import("@/components/tools/developer/XmlFormatter"),
  consumes: ["xml"],
  produces: ["xml"],
};

export default xmlFormatter;
