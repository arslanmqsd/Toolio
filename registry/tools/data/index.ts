import type { ToolConfig } from "@/registry/types";
import csvCleaner from "./csv-cleaner";
import jsonCsvConverter from "./json-csv-converter";
import jsonJsonlConverter from "./json-jsonl-converter";
import xmlJsonConverter from "./xml-json-converter";
import yamlJsonConverter from "./yaml-json-converter";

export const dataTools: ToolConfig[] = [jsonJsonlConverter, yamlJsonConverter, jsonCsvConverter, xmlJsonConverter, csvCleaner];
