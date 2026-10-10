/**
 * Lorem ipsum placeholder text, built word by word from the classic vocabulary so every count is
 * exact. A seeded PRNG makes the same seed and options always give the same text.
 */
import { plural, type Notice } from "@/lib/notices";
import { LOREM_OPENING, LOREM_WORDS } from "./lorem-words";

export type LoremUnit = "paragraphs" | "sentences" | "words" | "characters" | "listItems";
export type LoremFormat = "text" | "html" | "markdown";

export interface LoremOptions {
  unit: LoremUnit;
  count: number;
  /** Begin with "Lorem ipsum dolor sit amet, consectetur adipiscing elit." */
  startWithLorem: boolean;
  format: LoremFormat;
  /** A 32-bit unsigned integer. */
  seed: number;
}

export interface LoremStats {
  words: number;
  characters: number;
  paragraphs: number;
  sentences: number;
  listItems: number;
}

export interface LoremResult {
  value: string;
  /** Counted on the text, not the HTML or Markdown around it. */
  stats: LoremStats;
  seed: number;
  notices: Notice[];
}

/** A fixed first seed, so the page renders the same text on the server and in the browser. */
export const DEFAULT_SEED = 1;

export const DEFAULT_LOREM: LoremOptions = { unit: "paragraphs", count: 3, startWithLorem: true, format: "text", seed: DEFAULT_SEED };

export const LOREM_LIMITS: Record<LoremUnit, number> = {
  paragraphs: 100,
  sentences: 500,
  words: 10_000,
  characters: 100_000,
  listItems: 200,
};

export const unitNames: Record<LoremUnit, [one: string, many: string]> = {
  paragraphs: ["paragraph", "paragraphs"],
  sentences: ["sentence", "sentences"],
  words: ["word", "words"],
  characters: ["character", "characters"],
  listItems: ["list item", "list items"],
};

export const MAX_SEED = 0xffffffff;

export type Rng = () => number;

/** mulberry32: a small, fast PRNG. Not for secrets; placeholder text only needs to be reproducible. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed. It isn't secret; it only lets the same text be made again. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

const OPENING_WORDS = LOREM_OPENING.split(" ");

/** Writes words and sentences, remembering the last word so none comes twice in a row, even across sentences. */
class Writer {
  private last = "";

  constructor(private readonly rng: Rng) {}

  /** The opening has been written; carry on after its last word. */
  afterOpening() {
    this.last = "elit";
  }

  /** A word other than the last one, and other than `avoid`. */
  private word(avoid?: string): string {
    let word: string;
    do word = LOREM_WORDS[Math.floor(this.rng() * LOREM_WORDS.length)];
    while (word === this.last || word === avoid);
    this.last = word;
    return word;
  }

  words(count: number): string[] {
    // Only the opening starts with "Lorem", so text without it never looks like it does.
    return Array.from({ length: count }, (_, i) => this.word(i === 0 ? "lorem" : undefined));
  }

  /** A capitalized sentence ending in a period, with commas at least three words apart, never after the first word or before the last. */
  sentence(length = between(this.rng, 6, 16)): string {
    const words = this.words(length);
    let lastComma = -Infinity;
    for (let i = 2; i <= length - 3; i++) {
      if (i - lastComma >= 3 && this.rng() < 0.2) {
        words[i] += ",";
        lastComma = i;
      }
    }
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return `${words.join(" ")}.`;
  }

  sentences(count: number, startWithLorem: boolean): string[] {
    const out: string[] = [];
    if (startWithLorem && count > 0) {
      out.push(LOREM_OPENING);
      this.afterOpening();
    }
    while (out.length < count) out.push(this.sentence());
    return out;
  }

  /** List items: short sentences of 4-10 words, after the opening if asked. */
  listItems(count: number, startWithLorem: boolean): string[] {
    const out: string[] = [];
    if (startWithLorem) {
      out.push(LOREM_OPENING);
      this.afterOpening();
    }
    while (out.length < count) out.push(this.sentence(between(this.rng, 4, 10)));
    return out;
  }

  paragraph(startWithLorem = false): string {
    return this.sentences(between(this.rng, 3, 7), startWithLorem).join(" ");
  }

  /** Exactly `count` words as sentences. Sentences stay 6-16 words, except a text shorter than 6 words. */
  text(count: number, startWithLorem: boolean): string {
    const parts: string[] = [];
    let remaining = count;
    if (startWithLorem) {
      if (count < OPENING_WORDS.length) return `${OPENING_WORDS.slice(0, count).join(" ").replace(/[,.]$/, "")}.`;
      parts.push(LOREM_OPENING);
      this.afterOpening();
      remaining -= OPENING_WORDS.length;
    }
    while (remaining > 0) {
      // Leave at least 6 words for the last sentence.
      const length = remaining <= 16 ? remaining : between(this.rng, 6, Math.min(16, remaining - 6));
      parts.push(this.sentence(length));
      remaining -= length;
    }
    return parts.join(" ");
  }

  /** Exactly `count` characters, which may end mid-word but never on a space. */
  characters(count: number, startWithLorem: boolean): string {
    // Every word takes at least two characters with its space, so this is always long enough.
    let text = this.text(Math.ceil(count / 2) + 8, startWithLorem);
    if (text[count - 1] === " ") {
      // End the word there with a period, or if it already ends in punctuation, drop that to reach the next word's first letter.
      if (/[a-z]/i.test(text[count - 2])) return `${text.slice(0, count - 1)}.`;
      text = text.slice(0, count - 2) + text.slice(count - 1);
    }
    return text.slice(0, count);
  }
}

export function generateWords(count: number, rng: Rng): string[] {
  return new Writer(rng).words(count);
}

export function generateSentence(rng: Rng): string {
  return new Writer(rng).sentence();
}

export function generateParagraph(rng: Rng): string {
  return new Writer(rng).paragraph();
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function clampCount(unit: LoremUnit, requested: number, notices: Notice[]): number {
  const [one, many] = unitNames[unit];
  const max = LOREM_LIMITS[unit];
  const count = Number.isFinite(requested) ? Math.trunc(requested) : 1;
  if (count > max) {
    notices.push({ kind: "warning", message: `It makes up to ${plural(max, one, many)} at a time, so this is ${max.toLocaleString("en-US")}.` });
    return max;
  }
  if (count < 1) {
    notices.push({ kind: "warning", message: `It makes at least 1 ${one}, so this is 1.` });
    return 1;
  }
  return count;
}

export function generate(options: LoremOptions): LoremResult {
  const { unit, startWithLorem, format, seed } = options;
  const notices: Notice[] = [];
  const count = clampCount(unit, options.count, notices);
  const writer = new Writer(createRng(seed));

  let paragraphs: string[] = [];
  let items: string[] = [];
  if (unit === "paragraphs") paragraphs = Array.from({ length: count }, (_, i) => writer.paragraph(startWithLorem && i === 0));
  else if (unit === "sentences") paragraphs = [writer.sentences(count, startWithLorem).join(" ")];
  else if (unit === "words") paragraphs = [writer.text(count, startWithLorem)];
  else if (unit === "characters") paragraphs = [writer.characters(count, startWithLorem)];
  else items = writer.listItems(count, startWithLorem);

  const plain = unit === "listItems" ? items.join("\n") : paragraphs.join("\n\n");
  let value = plain;
  if (format === "html") {
    value = unit === "listItems" ? `<ul>\n${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}\n</ul>` : paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  } else if (format === "markdown" && unit === "listItems") {
    value = items.map((item) => `- ${item}`).join("\n");
  }

  return {
    value,
    stats: {
      words: plain.split(/\s+/).filter(Boolean).length,
      characters: plain.length,
      paragraphs: paragraphs.length,
      sentences: plain.match(/\.(?=\s|$)/g)?.length ?? 0,
      listItems: items.length,
    },
    seed,
    notices,
  };
}
