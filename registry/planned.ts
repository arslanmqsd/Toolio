import type { CategoryId } from "./categories";

/** Tools on the roadmap. Shown as "Coming soon"; never linked. */
export interface PlannedTool {
  id: string;
  category: CategoryId;
  title: string;
  description: string;
}

export const plannedTools: PlannedTool[] = [
  { id: "pdf-compressor", category: "files", title: "PDF Compressor", description: "Reduce PDF file size." },
  { id: "image-resizer", category: "images", title: "Image Resizer", description: "Resize images without losing quality." },
  { id: "csv-cleaner", category: "data", title: "CSV Cleaner", description: "Clean and fix messy CSV files." },
  { id: "word-counter", category: "text", title: "Word Counter", description: "Count words, characters, and reading time." },
  { id: "unit-converter", category: "calculators", title: "Unit Converter", description: "Convert length, weight, and temperature." },
];
