import type { ToolConfig } from "@/registry/types";

const yamlJsonConverter: ToolConfig = {
  id: "yaml-json-converter",
  category: "data",
  title: "YAML to JSON Converter",
  description: "Convert YAML to JSON and back, and catch values YAML changes quietly, like NO becoming false or 1.10 becoming 1.1.",
  keywords: [
    "yaml to json",
    "json to yaml",
    "convert yaml",
    "yaml converter",
    "yml to json",
    "json to yml",
    "yaml validator",
    "validate yaml",
    "yaml parser",
    "yaml 1.1 vs 1.2",
    "norway problem",
    "yaml anchors",
    "kubernetes yaml to json",
    "docker compose yaml",
  ],
  actions: ["convert", "format"],
  component: () => import("@/components/tools/data/YamlJsonConverter"),
  consumes: ["yaml", "json"],
  produces: ["json", "yaml"],
};

export default yamlJsonConverter;
