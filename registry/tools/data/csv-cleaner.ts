import type { ToolConfig } from "@/registry/types";

const csvCleaner: ToolConfig = {
  id: "csv-cleaner",
  category: "data",
  title: "CSV Cleaner",
  description: "Clean messy CSV files: trim spaces, remove empty rows, columns and duplicates, and fix ragged rows and headers.",
  keywords: [
    "csv cleaner",
    "clean csv",
    "fix csv",
    "tidy csv",
    "normalize csv",
    "remove duplicate rows",
    "remove empty rows",
    "remove empty columns",
    "trim whitespace csv",
    "change csv delimiter",
    "semicolon to comma",
    "csv invisible characters",
    "csv encoding",
    "excel csv",
  ],
  actions: ["clean", "transform"],
  component: () => import("@/components/tools/data/CsvCleaner"),
  consumes: ["csv"],
  produces: ["csv"],
};

export default csvCleaner;
