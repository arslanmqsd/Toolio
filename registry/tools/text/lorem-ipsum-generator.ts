import type { ToolConfig } from "@/registry/types";

const loremIpsumGenerator: ToolConfig = {
  id: "lorem-ipsum-generator",
  category: "text",
  title: "Lorem Ipsum Generator",
  description: "Generate lorem ipsum placeholder text by paragraphs, sentences, words or characters, as plain text, HTML or Markdown.",
  keywords: [
    "lorem ipsum generator",
    "lorem ipsum",
    "placeholder text",
    "dummy text generator",
    "dummy text",
    "lorem ipsum paragraphs",
    "random text generator",
    "filler text",
    "lorem ipsum html",
    "lorem ipsum markdown",
    "lorem ipsum 100 words",
    "lipsum",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/text/LoremIpsumGenerator"),
  consumes: [],
  produces: ["text", "html", "markdown"],
};

export default loremIpsumGenerator;
