import type { MetadataRoute } from "next";
import { allTools, categories, toolHref } from "@/registry";
import { absoluteUrl } from "@/lib/site";

/** Served at /sitemap.xml. Lists every tool from the registry, so new tools are included automatically. */
export default function sitemap(): MetadataRoute.Sitemap {
  // Categories with no live tools yet are thin pages; leave them out until they have some.
  const liveCategories = Object.values(categories).filter((category) =>
    allTools.some((tool) => tool.category === category.id),
  );

  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/tools"), changeFrequency: "weekly", priority: 0.8 },
    ...liveCategories.map((category) => ({
      url: absoluteUrl(`/tools/${category.id}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...allTools.map((tool) => ({
      url: absoluteUrl(toolHref(tool)),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
  ];
}
