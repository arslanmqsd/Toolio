import { accent, type CategoryTheme } from "./themes";

export type CategoryId = "developer" | "files" | "images" | "text" | "data" | "calculators";

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  description: string;
  /** Look of the category's pages. Omit for the default "precise" system. */
  theme?: CategoryTheme;
}

export const categories: Record<CategoryId, Category> = {
  developer: {
    id: "developer",
    label: "Developer",
    icon: "code",
    description: "Tools for everyday development tasks.",
    theme: { preset: "precise" },
  },
  files: {
    id: "files",
    label: "Files",
    icon: "file",
    description: "Convert, compress, and inspect files.",
    theme: { preset: "precise", ...accent("#8A6A2F", "#D4B574") },
  },
  images: {
    id: "images",
    label: "Images",
    icon: "image",
    description: "Resize, convert, and optimize images.",
    theme: { preset: "canvas", ...accent("#6556A3", "#B0A5E0") },
  },
  text: {
    id: "text",
    label: "Text",
    icon: "type",
    description: "Clean up, compare, and transform text.",
    theme: { preset: "precise", ...accent("#2F6690", "#86B6D6") },
  },
  data: {
    id: "data",
    label: "Data",
    icon: "table",
    description: "Work with CSV, spreadsheets, and structured data.",
    theme: { preset: "ledger", ...accent("#256F6F", "#6BC1C1") },
  },
  calculators: {
    id: "calculators",
    label: "Calculators",
    icon: "calculator",
    description: "Quick maths for time, units, and money.",
    theme: { preset: "ledger", ...accent("#974C62", "#D68FA4") },
  },
};
