export type CategoryId = "developer" | "files" | "images" | "text" | "data" | "calculators";

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  description: string;
}

export const categories: Record<CategoryId, Category> = {
  developer: {
    id: "developer",
    label: "Developer",
    icon: "code",
    description: "Tools for everyday development tasks.",
  },
  files: {
    id: "files",
    label: "Files",
    icon: "file",
    description: "Convert, compress, and inspect files.",
  },
  images: {
    id: "images",
    label: "Images",
    icon: "image",
    description: "Resize, convert, and optimize images.",
  },
  text: {
    id: "text",
    label: "Text",
    icon: "type",
    description: "Clean up, compare, and transform text.",
  },
  data: {
    id: "data",
    label: "Data",
    icon: "table",
    description: "Work with CSV, spreadsheets, and structured data.",
  },
  calculators: {
    id: "calculators",
    label: "Calculators",
    icon: "calculator",
    description: "Quick maths for time, units, and money.",
  },
};
