import type { ToolConfig } from "@/registry/types";
import jsonCsvConverter from "./json-csv-converter";
import jsonJsonlConverter from "./json-jsonl-converter";
import yamlJsonConverter from "./yaml-json-converter";

export const dataTools: ToolConfig[] = [jsonJsonlConverter, yamlJsonConverter, jsonCsvConverter];
