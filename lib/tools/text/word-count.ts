/**
 * Counts for a piece of text: words, sentences and paragraphs as a reader sees them, and its length
 * the four ways software measures it (characters, code points, UTF-16 units, UTF-8 bytes), plus SMS
 * segments and the most used words. Words and sentences come from Intl.Segmenter, so text without
 * spaces between words, like Chinese or Japanese, still counts sensibly.
 */

export interface TextLength {
  /** What a reader sees as one character: "👨‍👩‍👧" is 1. */
  characters: number;
  charactersNoSpaces: number;
  codePoints: number;
  /** JavaScript's string.length, and Java's and C#'s. */
  utf16: number;
  utf8Bytes: number;
}

export interface TextStats extends TextLength {
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingSeconds: number;
  speakingSeconds: number;
}

/** Average silent reading speed for English non-fiction (Brysbaert, 2019). */
export const READING_WPM = 238;
/** A comfortable pace for a talk or a voice-over. */
export const SPEAKING_WPM = 150;

const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const wordSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;
const sentenceSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "sentence" }) : null;

const WHITESPACE = /^\s+$/u;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
// Without Intl.Segmenter, a word is a run of letters, digits and inner apostrophes or hyphens.
const FALLBACK_WORD = /[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*/gu;

/** The words in a text, in order, as written. */
export function wordsOf(text: string): string[] {
  if (!wordSegmenter) return text.match(FALLBACK_WORD) ?? [];
  const words: string[] = [];
  for (const s of wordSegmenter.segment(text)) if (s.isWordLike) words.push(s.segment);
  return words;
}

function countSentences(text: string): number {
  if (!sentenceSegmenter) return text.split(/[.!?]+(?:\s+|$)/u).filter((s) => HAS_WORD_CHAR.test(s)).length;
  let count = 0;
  for (const s of sentenceSegmenter.segment(text)) if (HAS_WORD_CHAR.test(s.segment)) count++;
  return count;
}

function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function measure(text: string): TextLength {
  let characters = 0;
  let charactersNoSpaces = 0;
  const pieces = graphemes ? Array.from(graphemes.segment(text), (s) => s.segment) : Array.from(text);
  for (const piece of pieces) {
    characters++;
    if (!WHITESPACE.test(piece)) charactersNoSpaces++;
  }
  return { characters, charactersNoSpaces, codePoints: Array.from(text).length, utf16: text.length, utf8Bytes: utf8Length(text) };
}

export function countText(text: string): TextStats {
  const words = wordsOf(text).length;
  return {
    ...measure(text),
    words,
    sentences: countSentences(text),
    // Blocks of text between blank lines.
    paragraphs: text.split(/(?:\r?\n|\r)\s*(?:\r?\n|\r)/).filter((p) => p.trim()).length,
    lines: text ? text.split(/\r\n|\r|\n/).length : 0,
    readingSeconds: Math.round((words / READING_WPM) * 60),
    speakingSeconds: Math.round((words / SPEAKING_WPM) * 60),
  };
}

/** "45 sec", "3 min", "1 min 20 sec". Under a second reads as 0 sec. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
}

// GSM 03.38, the 7-bit SMS alphabet. Extension characters take two of a message's 160 places.
const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM_EXTENSION = new Set("^{}\\[~]|€\f");

export interface SmsCount {
  encoding: "GSM-7" | "UCS-2";
  /** Places used: GSM-7 septets, or UTF-16 units for UCS-2. */
  units: number;
  segments: number;
  /** How many places one segment holds at this length: 160/70 alone, 153/67 when split. */
  perSegment: number;
  /** Places left in the last segment. */
  remaining: number;
  /** Characters that forced UCS-2, each listed once. */
  unicodeCharacters: string[];
}

export function countSms(text: string): SmsCount {
  let septets = 0;
  const unicode = new Set<string>();
  for (const char of text) {
    if (GSM_BASIC.has(char)) septets += 1;
    else if (GSM_EXTENSION.has(char)) septets += 2;
    else unicode.add(char);
  }
  const gsm = unicode.size === 0;
  const units = gsm ? septets : text.length;
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  const perSegment = units <= single ? single : multi;
  const segments = units === 0 ? 0 : Math.ceil(units / perSegment);
  return {
    encoding: gsm ? "GSM-7" : "UCS-2",
    units,
    segments,
    perSegment,
    remaining: segments === 0 ? single : segments * perSegment - units,
    unicodeCharacters: [...unicode],
  };
}

// Common English words that say little about what a text is about.
const STOP_WORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing " +
    "down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more " +
    "most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs " +
    "them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with " +
    "would you your yours yourself yourselves it's i'm don't can't won't isn't that's there's"
  ).split(" "),
);

export interface WordFrequency {
  word: string;
  count: number;
  /** Share of all words, 0 to 1. */
  share: number;
}

/** The most used words, leaving out common English ones and numbers. */
export function topWords(text: string, limit = 10): WordFrequency[] {
  const words = wordsOf(text);
  const counts = new Map<string, number>();
  for (const word of words) {
    const lower = word.toLowerCase().replace(/’/g, "'");
    if (STOP_WORDS.has(lower) || !/\p{L}/u.test(lower)) continue;
    counts.set(lower, (counts.get(lower) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count, share: count / words.length }));
}
