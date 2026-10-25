import type { ToolConfig } from "@/registry/types";

const textCleaner: ToolConfig = {
  id: "text-cleaner",
  category: "text",
  title: "Text Cleaner",
  description: "Strip extra spaces, blank and duplicate lines, invisible characters and smart quotes from text, or unwrap lines.",
  keywords: [
    "text cleaner",
    "clean text",
    "remove extra spaces",
    "remove blank lines",
    "remove empty lines",
    "remove duplicate lines",
    "remove line breaks",
    "remove invisible characters",
    "zero width space remover",
    "non breaking space",
    "smart quotes to straight quotes",
    "trim whitespace",
  ],
  actions: ["clean"],
  component: () => import("@/components/tools/text/TextCleaner"),
  consumes: ["text"],
  produces: ["text"],
};

export default textCleaner;
