import { allTools, type ToolConfig } from "@/registry";
import { createFuzzySearch } from "./fuzzy";

export interface SearchResult {
  tool: ToolConfig;
  /** 0 = perfect match, 1 = no match. */
  score: number;
}

export function createSearch(tools: ToolConfig[]) {
  const fuzzy = createFuzzySearch(tools, [
    { name: "title", weight: 3 },
    { name: "keywords", weight: 2 },
    { name: "description", weight: 1 },
  ]);
  return (query: string, limit = 8): SearchResult[] => fuzzy(query, limit).map(({ item, score }) => ({ tool: item, score }));
}

/** Ranked matches across the full tool registry. */
export const search = createSearch(allTools);
