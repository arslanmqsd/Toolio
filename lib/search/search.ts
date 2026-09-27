import Fuse, { type IFuseOptions } from "fuse.js";
import { allTools, type ToolConfig } from "@/registry";

export interface SearchResult {
  tool: ToolConfig;
  /** 0 = perfect match, 1 = no match. */
  score: number;
}

const FUSE_OPTIONS: IFuseOptions<ToolConfig> = {
  keys: [
    { name: "title", weight: 3 },
    { name: "keywords", weight: 2 },
    { name: "description", weight: 1 },
  ],
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.4,
};

// Filler words in task phrasings ("convert THIS json TO typescript") that would
// otherwise fuzzy-match unrelated tools.
const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "can", "do", "for", "from", "how", "i", "in", "into", "is", "it", "me",
  "my", "need", "of", "on", "or", "please", "some", "the", "this", "that", "to", "want", "what", "with",
]);

const MAX_SCORE = 0.45;

export function createSearch(tools: ToolConfig[]) {
  const fuse = new Fuse(tools, FUSE_OPTIONS);

  function scores(query: string): Map<ToolConfig, number> {
    return new Map(fuse.search(query).map((r) => [r.item, r.score ?? 1]));
  }

  return function search(query: string, limit = 8): SearchResult[] {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return [];

    // Whole-query match catches phrasings that are close to a keyword.
    const whole = scores(trimmed);

    // Per-word match catches the same intent phrased differently: the tool's
    // score is the average over meaningful words, with 1 for a word it misses.
    const words = trimmed.split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w));
    const perWord = words.map(scores);

    return tools
      .map((tool) => {
        const wordScore = words.length
          ? perWord.reduce((sum, m) => sum + (m.get(tool) ?? 1), 0) / words.length
          : 1;
        return { tool, score: Math.min(whole.get(tool) ?? 1, wordScore) };
      })
      .filter((r) => r.score <= MAX_SCORE)
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  };
}

/** Ranked matches across the full tool registry. */
export const search = createSearch(allTools);
