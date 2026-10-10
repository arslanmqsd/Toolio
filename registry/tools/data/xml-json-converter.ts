import type { ToolConfig } from "@/registry/types";

const xmlJsonConverter: ToolConfig = {
  id: "xml-json-converter",
  category: "data",
  title: "XML to JSON Converter",
  description: "Convert XML to JSON and back. Keeps attributes and namespaces, flags repeated elements, and never expands entities.",
  keywords: [
    "xml to json",
    "json to xml",
    "convert xml to json",
    "convert json to xml",
    "xml json converter",
    "xml converter",
    "xml parser",
    "parse xml",
    "soap to json",
    "rss to json",
    "xml attributes to json",
    "xml2json",
    "json2xml",
  ],
  actions: ["convert", "transform"],
  component: () => import("@/components/tools/data/XmlJsonConverter"),
  consumes: ["xml", "json"],
  produces: ["json", "xml"],
};

export default xmlJsonConverter;
