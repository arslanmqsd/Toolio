/**
 * Text case conversion. Prose cases (lower, UPPER, Title, Sentence) change letters in place and
 * keep punctuation and spacing; code cases (camelCase, snake_case…) split each line into words,
 * camelCase humps included, and join them again.
 */
import { transliterate } from "./transliterate";

export const CASES = [
  "lower",
  "upper",
  "title",
  "sentence",
  "camel",
  "pascal",
  "snake",
  "kebab",
  "constant",
  "dot",
  "path",
  "train",
] as const;

export type TextCase = (typeof CASES)[number];

/** Each case's name, written in that case. */
export const caseLabels: Record<TextCase, string> = {
  lower: "lower case",
  upper: "UPPER CASE",
  title: "Title Case",
  sentence: "Sentence case",
  camel: "camelCase",
  pascal: "PascalCase",
  snake: "snake_case",
  kebab: "kebab-case",
  constant: "CONSTANT_CASE",
  dot: "dot.case",
  path: "path/case",
  train: "Train-Case",
};

const PROSE_CASES = new Set<TextCase>(["lower", "upper", "title", "sentence"]);

export const isCodeCase = (c: TextCase) => !PROSE_CASES.has(c);

export interface CaseOptions {
  /** Code cases: spell accented and Cyrillic letters in plain Latin (crème → creme). */
  transliterate: boolean;
  /** Title and Sentence case: leave words in capitals, like NASA or HTML, as they are. */
  keepAcronyms: boolean;
  /** Title case: keep a, the, of and other short words lower case, except first and last. */
  lowerSmallWords: boolean;
}

export const DEFAULT_CASE_OPTIONS: CaseOptions = { transliterate: true, keepAcronyms: true, lowerSmallWords: true };

// Short articles, conjunctions and prepositions, as most title case styles (AP, Chicago) leave them.
const SMALL_WORDS = new Set("a an and as at but by en for if in nor of on or per the to v vs via".split(" "));

// An acronym, a capitalised or lower-case word, a number, or a run of letters in an uncased script.
// "XMLHttpRequest2" → XML, Http, Request, 2.
const CODE_WORD = /\p{Lu}+(?![\p{Ll}\p{M}])|\p{Lu}?[\p{Ll}\p{M}]+|\p{Lu}+|\p{N}+|[\p{L}\p{M}]+/gu;
const INNER_APOSTROPHE = /(?<=[\p{L}\p{N}])['’ʼ](?=[\p{L}\p{N}])/gu;
// A word in prose: letters and digits, with any apostrophes inside it ("don't").
const PROSE_WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu;
const HAS_LOWER = /\p{Ll}/u;
const HAS_UPPER = /\p{Lu}/u;

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** Splits a line into words for code cases, breaking at spaces, punctuation and camelCase humps. */
export function splitWords(line: string, options: Pick<CaseOptions, "transliterate"> = DEFAULT_CASE_OPTIONS): string[] {
  const text = (options.transliterate ? transliterate(line) : line).replace(INNER_APOSTROPHE, "");
  return text.match(CODE_WORD) ?? [];
}

function codeCase(words: string[], textCase: TextCase): string {
  const lower = words.map((w) => w.toLowerCase());
  switch (textCase) {
    case "camel":
      return lower.map((w, i) => (i === 0 ? w : capitalise(w))).join("");
    case "pascal":
      return words.map(capitalise).join("");
    case "snake":
      return lower.join("_");
    case "kebab":
      return lower.join("-");
    case "constant":
      return words.map((w) => w.toUpperCase()).join("_");
    case "dot":
      return lower.join(".");
    case "path":
      return lower.join("/");
    case "train":
      return words.map(capitalise).join("-");
    default:
      throw new Error(`Not a code case: ${textCase}`);
  }
}

/** A word in capitals that should stay that way: two or more letters, no lower case. */
const isAcronym = (word: string) => word.length > 1 && HAS_UPPER.test(word) && !HAS_LOWER.test(word);

function titleCase(text: string, options: CaseOptions, keepAcronyms: boolean): string {
  return text
    .split("\n")
    .map((line) => {
      const matches = [...line.matchAll(PROSE_WORD)];
      let i = 0;
      return line.replace(PROSE_WORD, (word) => {
        const index = i++;
        if (keepAcronyms && isAcronym(word)) return word;
        const lower = word.toLowerCase();
        const edge = index === 0 || index === matches.length - 1;
        // A word after a colon starts a subtitle: "Dune: The Desert Planet".
        const afterColon = index > 0 && /[:—–]\s*$/.test(line.slice(0, matches[index].index));
        if (options.lowerSmallWords && !edge && !afterColon && SMALL_WORDS.has(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      });
    })
    .join("\n");
}

function sentenceCase(text: string, keepAcronyms: boolean): string {
  // The first word of the text, and of each line and sentence, gets a capital.
  let startOfSentence = true;
  let out = "";
  let last = 0;
  for (const match of text.matchAll(PROSE_WORD)) {
    const between = text.slice(last, match.index);
    if (/[.!?]\s|\n/.test(between) || (last > 0 && /[.!?]$/.test(between))) startOfSentence = true;
    out += between;
    const word = match[0];
    if (keepAcronyms && isAcronym(word)) out += word;
    // "I" on its own is always a capital in English.
    else if (word.toLowerCase() === "i" || /^i['’]/i.test(word)) out += "I" + word.slice(1).toLowerCase();
    else out += startOfSentence ? capitalise(word) : word.toLowerCase();
    startOfSentence = false;
    last = match.index + word.length;
  }
  return out + text.slice(last);
}

export function convertCase(text: string, textCase: TextCase, options: CaseOptions = DEFAULT_CASE_OPTIONS): string {
  // Text that's all capitals has no acronyms to keep: "HELLO WORLD" → "Hello World", not left as is.
  const keepAcronyms = options.keepAcronyms && HAS_LOWER.test(text);
  switch (textCase) {
    case "lower":
      return text.toLowerCase();
    case "upper":
      return text.toUpperCase();
    case "title":
      return titleCase(text, options, keepAcronyms);
    case "sentence":
      return sentenceCase(text, keepAcronyms);
    default:
      // Each line is its own identifier, so a list of names converts in one go.
      return text
        .split(/\r?\n/)
        .map((line) => codeCase(splitWords(line, options), textCase))
        .join("\n");
  }
}
