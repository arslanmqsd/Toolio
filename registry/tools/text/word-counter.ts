import type { ToolConfig } from "@/registry/types";

const wordCounter: ToolConfig = {
  id: "word-counter",
  category: "text",
  title: "Word Counter",
  description: "Count words, characters, sentences and reading time, with length in UTF-8 bytes, code points and SMS segments.",
  keywords: [
    "word counter",
    "word count",
    "character counter",
    "character count",
    "letter counter",
    "string length",
    "count characters",
    "reading time",
    "byte counter",
    "utf-8 byte length",
    "sms character counter",
    "sentence counter",
  ],
  actions: ["inspect"],
  component: () => import("@/components/tools/text/WordCounter"),
  consumes: ["text"],
  produces: [],
};

export default wordCounter;
