/**
 * URL slugs from titles, one per line: transliterated to Latin letters, split into words and joined
 * with a separator, optionally shortened at a word boundary and numbered when repeated.
 */
import { plural, some, type Notice } from "@/lib/notices";
import { formulaNotice, isFormulaCell, writeCsv } from "@/lib/tools/data/json-csv";
import { transliterate } from "./transliterate";

export type SlugSeparator = "-" | "_" | ".";
export type SlugFormat = "slugs" | "csv";

export interface SlugOptions {
  separator: SlugSeparator;
  lowercase: boolean;
  /** Longest a slug may be, in characters; 0 for no limit. Cut at a word boundary where possible. */
  maxLength: number;
  /** Leave out short English words like "a", "the" and "of", unless that would leave nothing. */
  removeStopWords: boolean;
  /** Give repeated slugs -2, -3 and so on, so every line gets its own. */
  unique: boolean;
  /** Keep letters with no Latin spelling (中文, العربية) instead of dropping them. */
  keepUnicode: boolean;
  /** Text to swap before slugging, like "&" → "and". */
  replacements: Replacement[];
  format: SlugFormat;
}

export interface Replacement {
  from: string;
  to: string;
}

export interface SlugLine {
  /** The line as typed, without surrounding whitespace. */
  source: string;
  slug: string;
}

export interface SlugResult {
  /** One per input line, blank lines included, so output lines up with input. */
  lines: SlugLine[];
  /** Slugs one per line, or a title,slug CSV. */
  output: string;
  notices: Notice[];
}

export const DEFAULT_REPLACEMENTS = "&=and";

export const DEFAULT_SLUG: SlugOptions = {
  separator: "-",
  lowercase: true,
  maxLength: 0,
  removeStopWords: false,
  unique: true,
  keepUnicode: false,
  replacements: parseReplacements(DEFAULT_REPLACEMENTS).replacements,
  format: "slugs",
};

export const MAX_SLUG_LENGTH = 500;

/** Search engines show about this much of a URL; longer slugs are flagged. */
export const LONG_SLUG = 75;

const STOP_WORDS = new Set(
  "a an and are as at be but by for from in into is it of on or the to with".split(" "),
);

// Apostrophes inside a word go, so "don't" is "dont" rather than "don-t".
const INNER_APOSTROPHE = /(?<=[\p{L}\p{N}])['’ʼ](?=[\p{L}\p{N}])/gu;
const ASCII_WORD = /[A-Za-z0-9]+/g;
const UNICODE_WORD = /[\p{L}\p{N}\p{M}]+/gu;
const NON_ASCII_LETTER = /[^\x00-\x7F]/u;
const LETTER = /[\p{L}\p{N}]/u;

/**
 * Reads replacements written one per line as `from=to`. The first = after the first character
 * splits them, so "==equals" swaps "=" for "equals". Surrounding spaces are ignored.
 */
export function parseReplacements(text: string): { replacements: Replacement[]; invalidLines: number[] } {
  const replacements: Replacement[] = [];
  const invalidLines: number[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const split = line.indexOf("=", 1);
    if (split === -1) {
      invalidLines.push(i + 1);
      return;
    }
    const from = line.slice(0, split).trim();
    if (from) replacements.push({ from, to: line.slice(split + 1).trim() });
    else invalidLines.push(i + 1);
  });
  return { replacements, invalidLines };
}

function replace(text: string, replacements: Replacement[]): string {
  // Spaces around each replacement keep it its own word: "Tom&Jerry" → "Tom and Jerry".
  return replacements.reduce((out, r) => (r.from ? out.split(r.from).join(` ${r.to} `) : out), text);
}

/** Joins words with the separator, stopping before `max` characters; a first word that's too long is cut. */
function fit(words: string[], separator: string, max: number): { slug: string; cut: boolean } {
  const whole = words.join(separator);
  if (!max || whole.length <= max) return { slug: whole, cut: false };
  let slug = "";
  for (const word of words) {
    const next = slug ? slug + separator + word : word;
    if (next.length > max) break;
    slug = next;
  }
  return { slug: slug || words[0].slice(0, max), cut: true };
}

interface Slugged {
  words: string[];
  /** Letters dropped for having no Latin spelling. */
  dropped: string[];
}

function words(source: string, options: SlugOptions): Slugged {
  const latin = transliterate(replace(source, options.replacements)).replace(INNER_APOSTROPHE, "");
  let found: string[] = latin.match(options.keepUnicode ? UNICODE_WORD : ASCII_WORD) ?? [];
  const dropped = options.keepUnicode ? [] : [...latin].filter((c) => NON_ASCII_LETTER.test(c) && LETTER.test(c));
  if (options.lowercase) found = found.map((w) => w.toLowerCase());
  if (options.removeStopWords) {
    const kept = found.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
    if (kept.length) found = kept;
  }
  return { words: found, dropped };
}

/** One slug, for a single title. Use slugifyLines for a list, which also numbers repeats. */
export function slugify(source: string, options: Partial<SlugOptions> = {}): string {
  const opts = { ...DEFAULT_SLUG, ...options };
  const { words: found } = words(source, opts);
  return found.length ? fit(found, opts.separator, opts.maxLength).slug : "";
}

export function slugifyLines(text: string, options: SlugOptions): SlugResult {
  const { separator, maxLength } = options;
  const used = new Set<string>();
  const nextNumber = new Map<string, number>();
  const empty: number[] = [];
  const dropped = new Set<string>();
  let shortened = 0;
  let numbered = 0;

  const lines = text.split(/\r?\n/).map((line, i): SlugLine => {
    const source = line.trim();
    if (!source) return { source, slug: "" };
    const parts = words(source, options);
    parts.dropped.forEach((c) => dropped.add(c));
    if (!parts.words.length) {
      empty.push(i + 1);
      return { source, slug: "" };
    }
    let { slug, cut } = fit(parts.words, separator, maxLength);
    if (options.unique && used.has(slug)) {
      const base = slug;
      let n = nextNumber.get(base) ?? 2;
      // Skip numbers a line already has as its own slug: "post-2" typed, then "post" twice.
      do {
        const suffix = `${separator}${n++}`;
        const room = maxLength ? Math.max(0, maxLength - suffix.length) : base.length;
        const trimmed = base.slice(0, room).replace(/[-_.]+$/, "");
        if (trimmed.length < base.length) cut = true;
        slug = trimmed + suffix;
      } while (used.has(slug));
      nextNumber.set(base, n);
      numbered++;
    }
    used.add(slug);
    if (cut) shortened++;
    return { source, slug };
  });

  const notices: Notice[] = [];
  if (empty.length) {
    notices.push({
      kind: "warning",
      message: `${plural(empty.length, "line gives", "lines give")} an empty slug (line ${some(empty.map(String))}), as nothing in ${empty.length === 1 ? "it" : "them"} can go in a URL.${options.keepUnicode ? "" : " Turning on “Keep non-Latin letters” may help."}`,
    });
  }
  if (dropped.size) {
    notices.push({
      kind: "warning",
      message: `Left out ${plural(dropped.size, "letter", "letters")} with no Latin spelling: ${some([...dropped], 8)}. Turn on “Keep non-Latin letters” to keep them; most browsers and servers handle them.`,
    });
  }
  if (shortened) notices.push({ kind: "info", message: `Shortened ${plural(shortened, "slug", "slugs")} to ${maxLength} characters.` });
  if (numbered) notices.push({ kind: "info", message: `Numbered ${plural(numbered, "repeated slug", "repeated slugs")} so each one is unique.` });

  let output: string;
  if (options.format === "csv") {
    const rows = lines.filter((l) => l.source);
    let formulas = 0;
    // Titles come from anywhere; escape ones a spreadsheet would run as a formula.
    const cell = (value: string) => (isFormulaCell(value) ? (formulas++, `'${value}`) : value);
    output = writeCsv([["title", "slug"], ...rows.map((l) => [cell(l.source), l.slug])], ",", false);
    if (formulas) notices.push(formulaNotice(formulas, true));
  } else {
    output = lines.map((l) => l.slug).join("\n");
  }

  return { lines, output, notices };
}
