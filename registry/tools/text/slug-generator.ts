import type { ToolConfig } from "@/registry/types";

const slugGenerator: ToolConfig = {
  id: "slug-generator",
  category: "text",
  title: "Slug Generator",
  description: "Turn titles into clean URL slugs in bulk. Transliterates accents and Cyrillic, limits length and numbers repeats.",
  keywords: [
    "slug generator",
    "url slug generator",
    "slugify",
    "slug",
    "url slug",
    "seo friendly url",
    "permalink generator",
    "title to url",
    "text to slug",
    "kebab case",
    "bulk slug generator",
    "transliterate",
  ],
  actions: ["convert"],
  component: () => import("@/components/tools/text/SlugGenerator"),
  consumes: ["text"],
  produces: ["text", "csv"],
};

export default slugGenerator;
