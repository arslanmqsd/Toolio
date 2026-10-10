import type { ToolConfig } from "@/registry/types";

const jsonToTypes: ToolConfig = {
  id: "json-to-types",
  category: "developer",
  title: "JSON to Types",
  description: "Generate TypeScript interfaces, Zod schemas, Python TypedDicts, or Go structs from a JSON sample.",
  keywords: [
    "json",
    "types",
    "schema",
    "json to typescript",
    "convert json to typescript",
    "json to ts",
    "typescript interface from json",
    "generate types from json",
    "json to interface",
    "json to python",
    "json to typeddict",
    "python types from json",
    "json to go",
    "json to go struct",
    "golang struct from json",
    "json to zod",
    "zod schema from json",
    "generate zod schema",
    "json validation schema",
    "type an api response",
    "infer types from json",
  ],
  actions: ["convert", "generate"],
  component: () => import("@/components/tools/developer/JsonToTypes"),
  consumes: ["json"],
  produces: ["code"],
};

export default jsonToTypes;
