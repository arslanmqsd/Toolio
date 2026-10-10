// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOREM,
  LOREM_LIMITS,
  generate,
  generateParagraph,
  generateSentence,
  generateWords,
  type LoremOptions,
} from "./lorem-ipsum";
import { createRng, randomSeed } from "@/lib/random/seeded";
import { LOREM_OPENING, LOREM_WORDS } from "./lorem-words";

const gen = (options: Partial<LoremOptions> = {}) => generate({ ...DEFAULT_LOREM, ...options });
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const sentencesOf = (text: string) => text.split(/(?<=\.)\s+/).filter(Boolean);
const bareWords = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];

describe("lorem-words", () => {
  it("has 150-200 unique lowercase words", () => {
    expect(new Set(LOREM_WORDS).size).toBe(LOREM_WORDS.length);
    expect(LOREM_WORDS.length).toBeGreaterThanOrEqual(150);
    expect(LOREM_WORDS.length).toBeLessThanOrEqual(200);
    expect(LOREM_WORDS.every((w) => /^[a-z]+$/.test(w))).toBe(true);
  });
});

describe("building blocks", () => {
  it("generates an exact number of words, never the same twice in a row", () => {
    const words = generateWords(1000, createRng(1));
    expect(words).toHaveLength(1000);
    expect(words.some((w, i) => w === words[i - 1])).toBe(false);
  });

  it("generates sentences of 6-16 words with commas in plausible places", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const sentence = generateSentence(rng);
      const words = sentence.split(" ");
      expect(words.length).toBeGreaterThanOrEqual(6);
      expect(words.length).toBeLessThanOrEqual(16);
      expect(sentence).toMatch(/^[A-Z][a-z]*[^,]/);
      expect(sentence).toMatch(/[a-z]\.$/);
      expect(words.at(-2)).not.toMatch(/,$/);
      expect(words.some((w, j) => w.endsWith(",") && words[j + 1]?.endsWith(","))).toBe(false);
    }
  });

  it("generates paragraphs of 3-7 sentences", () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      const n = sentencesOf(generateParagraph(rng)).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});

describe("generate counts", () => {
  it.each([1, 5, 100])("makes exactly %i words", (count) => {
    for (const startWithLorem of [true, false]) {
      const r = gen({ unit: "words", count, startWithLorem });
      expect(wordCount(r.value)).toBe(count);
      expect(r.stats.words).toBe(count);
    }
  });

  it("makes exact numbers of sentences, paragraphs and list items", () => {
    expect(sentencesOf(gen({ unit: "sentences", count: 12 }).value)).toHaveLength(12);
    expect(gen({ unit: "sentences", count: 12 }).stats.sentences).toBe(12);
    const paragraphs = gen({ unit: "paragraphs", count: 4 });
    expect(paragraphs.value.split("\n\n")).toHaveLength(4);
    expect(paragraphs.stats.paragraphs).toBe(4);
    expect(gen({ unit: "listItems", count: 9 }).value.split("\n")).toHaveLength(9);
    expect(gen({ unit: "listItems", count: 9, format: "markdown" }).value.split("\n").every((l) => l.startsWith("- "))).toBe(true);
  });

  it("makes exactly the number of characters asked for", () => {
    for (let count = 1; count <= 300; count++) {
      for (const startWithLorem of [true, false]) {
        const r = gen({ unit: "characters", count, startWithLorem, seed: count });
        expect(r.value).toHaveLength(count);
        expect(r.value).toBe(r.value.trim());
        expect(r.stats.characters).toBe(count);
      }
    }
  });
});

describe("startWithLorem", () => {
  it("begins with the standard opening, or not", () => {
    for (const unit of ["paragraphs", "sentences", "listItems"] as const) {
      expect(gen({ unit }).value.startsWith(LOREM_OPENING)).toBe(true);
      expect(gen({ unit, startWithLorem: false }).value.startsWith("Lorem ipsum dolor sit amet")).toBe(false);
    }
    for (let seed = 0; seed < 200; seed++) {
      const { value } = gen({ unit: "sentences", count: 20, startWithLorem: false, seed });
      expect(sentencesOf(value).some((s) => s.startsWith("Lorem "))).toBe(false);
    }
    expect(gen({ unit: "words", count: 20 }).value.startsWith(LOREM_OPENING)).toBe(true);
    expect(gen({ unit: "words", count: 3 }).value).toBe("Lorem ipsum dolor.");
    expect(gen({ unit: "words", count: 5 }).value).toBe("Lorem ipsum dolor sit amet.");
    expect(gen({ unit: "characters", count: 11 }).value).toBe("Lorem ipsum");
    expect(gen({ unit: "characters", count: 12 }).value).toBe("Lorem ipsum.");
  });
});

describe("reproducibility", () => {
  it("gives the same text for the same seed and options, and different text for another seed", () => {
    expect(gen({ seed: 99 }).value).toBe(gen({ seed: 99 }).value);
    expect(gen({ seed: 99 }).seed).toBe(99);
    expect(gen({ seed: 99 }).value).not.toBe(gen({ seed: 100 }).value);
  });
});

describe("text quality", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("reads like lorem ipsum (seed %i)", (seed) => {
    for (const unit of ["paragraphs", "sentences", "words", "listItems"] as const) {
      for (const startWithLorem of [true, false]) {
        const { value } = gen({ unit, count: unit === "words" ? 137 : 6, startWithLorem, seed });
        expect(value).toBe(value.trim());
        expect(value).not.toMatch(/ {2}/);
        expect(value).not.toMatch(/,\s*,/);
        expect(value).not.toMatch(/,\s*$|,\n|,\./m);
        for (const sentence of value.split("\n").flatMap(sentencesOf)) {
          expect(sentence).toMatch(/^[A-Z]/);
          expect(sentence).toMatch(/\.$/);
        }
        const words = bareWords(value);
        expect(words.some((w, i) => w === words[i - 1])).toBe(false);
      }
    }
  });
});

describe("formats", () => {
  it("writes HTML that parses with balanced tags", () => {
    const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
    const paragraphs = gen({ count: 3, format: "html" }).value;
    expect(parse(paragraphs).querySelectorAll(":scope > p")).toHaveLength(3);
    expect(parse(paragraphs).innerHTML).toBe(paragraphs);
    const list = gen({ unit: "listItems", count: 4, format: "html" }).value;
    expect(parse(list).querySelectorAll(":scope > ul > li")).toHaveLength(4);
    expect(parse(list).innerHTML).toBe(list);
    expect(gen({ unit: "words", count: 4, format: "html" }).value).toBe("<p>Lorem ipsum dolor sit.</p>");
  });

  it("separates paragraphs with a blank line in text and Markdown", () => {
    expect(gen({ format: "markdown" }).value).toBe(gen({ format: "text" }).value);
    expect(gen({ format: "text" }).value.split("\n\n")).toHaveLength(3);
  });

  it("counts the text, not the markup", () => {
    expect(gen({ format: "html" }).stats).toEqual(gen({ format: "text" }).stats);
  });
});

describe("limits", () => {
  it.each(Object.entries(LOREM_LIMITS))("clamps %s to %i and says so", (unit, max) => {
    const r = gen({ unit: unit as LoremOptions["unit"], count: max + 1 });
    expect(r.notices).toEqual([{ kind: "warning", message: expect.stringContaining(max.toLocaleString("en-US")) }]);
    const n = { paragraphs: r.stats.paragraphs, sentences: r.stats.sentences, words: r.stats.words, characters: r.stats.characters, listItems: r.stats.listItems }[unit];
    expect(n).toBe(max);
    expect(gen({ unit: unit as LoremOptions["unit"], count: max }).notices).toEqual([]);
  });

  it("makes at least one", () => {
    const r = gen({ count: 0 });
    expect(r.stats.paragraphs).toBe(1);
    expect(r.notices[0].message).toMatch(/at least 1/i);
  });
});

describe("side effects", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never calls Math.random or fetch", () => {
    const random = vi.spyOn(Math, "random");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const unit of Object.keys(LOREM_LIMITS) as LoremOptions["unit"][]) {
      for (const format of ["text", "html", "markdown"] as const) gen({ unit, format, seed: randomSeed() });
    }
    expect(random).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
