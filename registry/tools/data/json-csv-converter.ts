import type { ToolConfig } from "@/registry/types";

const jsonCsvConverter: ToolConfig = {
  id: "json-csv-converter",
  category: "data",
  title: "JSON to CSV Converter",
  description: "Convert JSON to CSV and back. Flattens nested objects, keeps numbers exact and flags cells Excel would run as formulas.",
  keywords: [
    "json to csv",
    "csv to json",
    "convert json to csv",
    "convert csv to json",
    "json csv converter",
    "csv converter",
    "json to excel",
    "excel to json",
    "json to spreadsheet",
    "flatten json",
    "csv parser",
    "tsv to json",
    "json to tsv",
    "csv injection",
  ],
  actions: ["convert", "transform"],
  component: () => import("@/components/tools/data/JsonCsvConverter"),
  consumes: ["csv", "json"],
  produces: ["json", "csv"],
};

export default jsonCsvConverter;
