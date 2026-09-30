import type { Metadata } from "next";
import { categories, toolHref, type ToolConfig } from "@/registry";
import { SITE_NAME } from "./site";

/** Every tool page says this, so the snippet tells searchers what's different about Toolio. */
const TOOL_DESCRIPTION_SUFFIX = "Free, runs in your browser, no sign-up.";

export function toolDescription(tool: ToolConfig): string {
  return `${tool.description} ${TOOL_DESCRIPTION_SUFFIX}`;
}

/** Page metadata for a tool, built from its registry config so new tools get it for free. */
export function toolMetadata(tool: ToolConfig): Metadata {
  const description = toolDescription(tool);
  const url = toolHref(tool);
  return {
    // The root layout's title template adds " | Toolio".
    title: tool.title,
    description,
    keywords: [...new Set([...tool.keywords, categories[tool.category].label.toLowerCase(), "online tool"])],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: `${tool.title} | ${SITE_NAME}`,
      description,
      url,
    },
    twitter: { card: "summary", title: `${tool.title} | ${SITE_NAME}`, description },
  };
}
