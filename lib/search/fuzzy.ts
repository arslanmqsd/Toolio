import Fuse, { type FuseOptionKey } from "fuse.js";

export interface FuzzyMatch<T> {
  item: T;
  /** 0 = perfect match, 1 = no match. */
  score: number;
}

// Filler words in task phrasings ("convert THIS json TO typescript") that would
// otherwise fuzzy-match unrelated items.
const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "can", "do", "for", "from", "how", "i", "in", "into", "is", "it", "me",
  "my", "need", "of", "on", "or", "please", "some", "the", "this", "that", "to", "want", "what", "with",
]);

const MAX_SCORE = 0.45;

/** Ranks `items` against free-text queries, by the weighted `keys`. */
export function createFuzzySearch<T>(items: readonly T[], keys: FuseOptionKey<T>[]) {
  const fuse = new Fuse(items, { keys, includeScore: true, ignoreLocation: true, threshold: 0.4 });

  function scores(query: string): Map<T, number> {
    return new Map(fuse.search(query).map((r) => [r.item, r.score ?? 1]));
  }

  return function search(query: string, limit = Infinity): FuzzyMatch<T>[] {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return [];

    // Whole-query match catches phrasings that are close to a keyword.
    const whole = scores(trimmed);

    // Per-word match catches the same intent phrased differently: the item's
    // score is the average over meaningful words, with 1 for a word it misses.
    const words = trimmed.split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w));
    const perWord = words.map(scores);

    return items
      .map((item) => {
        const wordScore = words.length
          ? perWord.reduce((sum, m) => sum + (m.get(item) ?? 1), 0) / words.length
          : 1;
        return { item, score: Math.min(whole.get(item) ?? 1, wordScore) };
      })
      .filter((r) => r.score <= MAX_SCORE)
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  };
}
