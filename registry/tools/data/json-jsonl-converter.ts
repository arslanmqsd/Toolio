import type { ToolConfig } from "@/registry/types";

const jsonJsonlConverter: ToolConfig = {
  id: "json-jsonl-converter",
  category: "data",
  title: "JSON to JSONL Converter",
  description: "Convert JSON arrays to JSON Lines and back, and find the exact line that breaks a JSONL file.",
  keywords: [
    "json to jsonl",
    "jsonl to json",
    "convert jsonl",
    "json lines converter",
    "json lines to json",
    "jsonl validator",
    "validate jsonl",
    "jsonl error line",
    "find broken line in jsonl",
    "ndjson",
    "ndjson to json",
    "json to ndjson",
    "flatten json",
    "remove json fields",
  ],
  actions: ["convert", "format", "clean"],
  component: () => import("@/components/tools/developer/JsonJsonlConverter"),
  consumes: ["json", "jsonl"],
  produces: ["json", "jsonl"],
};

export default jsonJsonlConverter;
