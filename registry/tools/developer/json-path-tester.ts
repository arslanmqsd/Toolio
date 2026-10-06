import type { ToolConfig } from "@/registry/types";

const jsonPathTester: ToolConfig = {
  id: "json-path-tester",
  category: "developer",
  title: "JSON Path Tester",
  description: "Query JSON with a JSONPath expression and see every match with its exact path, as you type.",
  keywords: [
    "jsonpath",
    "json path",
    "jsonpath tester",
    "json path query",
    "jsonpath evaluator",
    "test json path",
    "jsonpath syntax",
    "query json with jsonpath",
    "jsonpath filter",
    "jsonpath online",
    "find values in json",
    "extract values from json",
  ],
  actions: ["inspect", "extract"],
  component: () => import("@/components/tools/developer/JsonPathTester"),
  consumes: ["json"],
  produces: ["json", "text"],
};

export default jsonPathTester;
