import { describe, expect, it } from "vitest";
import { countSms, countText, formatDuration, measure, topWords, wordsOf } from "./word-count";

describe("measure", () => {
  it("counts length four ways", () => {
    expect(measure("héllo")).toEqual({ characters: 5, charactersNoSpaces: 5, codePoints: 5, utf16: 5, utf8Bytes: 6 });
    // A family emoji: 3 people joined by 2 zero-width joiners.
    expect(measure("👨‍👩‍👧")).toEqual({ characters: 1, charactersNoSpaces: 1, codePoints: 5, utf16: 8, utf8Bytes: 18 });
    expect(measure("é")).toMatchObject({ characters: 1, codePoints: 2 });
  });

  it("leaves whitespace out of the no-spaces count", () => {
    expect(measure("a b\tc\nd\r\n")).toMatchObject({ characters: 8, charactersNoSpaces: 4 });
  });
});

describe("wordsOf", () => {
  it("keeps contractions and decimals whole, ignoring punctuation", () => {
    expect(wordsOf("Don't stop — it's 3.5 times better!")).toEqual(["Don't", "stop", "it's", "3.5", "times", "better"]);
  });

  it("splits text without spaces into words", () => {
    expect(wordsOf("我喜欢猫").length).toBeGreaterThan(1);
  });
});

describe("countText", () => {
  it("counts words, sentences, paragraphs and lines", () => {
    const stats = countText("Hello there. How are you?\nFine!\n\n  \nNew paragraph here");
    expect(stats).toMatchObject({ words: 9, sentences: 4, paragraphs: 2, lines: 5 });
  });

  it("does not count a sentence for stray punctuation, or a line for empty text", () => {
    expect(countText("")).toMatchObject({ words: 0, sentences: 0, paragraphs: 0, lines: 0, characters: 0 });
    expect(countText("...")).toMatchObject({ words: 0, sentences: 0 });
  });

  it("estimates reading and speaking time", () => {
    const stats = countText("word ".repeat(476));
    expect(stats.readingSeconds).toBe(120);
    expect(stats.speakingSeconds).toBe(190);
  });
});

describe("formatDuration", () => {
  it("reads as seconds, minutes, or both", () => {
    expect(formatDuration(0)).toBe("0 sec");
    expect(formatDuration(45)).toBe("45 sec");
    expect(formatDuration(180)).toBe("3 min");
    expect(formatDuration(80)).toBe("1 min 20 sec");
  });
});

describe("countSms", () => {
  it("fits 160 GSM-7 characters in one segment, then 153 per segment", () => {
    expect(countSms("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1, remaining: 0 });
    expect(countSms("a".repeat(161))).toMatchObject({ segments: 2, perSegment: 153, remaining: 145 });
  });

  it("counts extension characters twice", () => {
    expect(countSms("€[]")).toMatchObject({ encoding: "GSM-7", units: 6 });
  });

  it("switches to UCS-2 for other characters and says which", () => {
    const sms = countSms("Hi 😀 ç");
    expect(sms).toMatchObject({ encoding: "UCS-2", units: 7, segments: 1, perSegment: 70, remaining: 63 });
    expect(sms.unicodeCharacters).toEqual(["😀", "ç"]);
    expect(countSms("😀".repeat(36))).toMatchObject({ units: 72, segments: 2, perSegment: 67 });
  });

  it("has no segments for empty text", () => {
    expect(countSms("")).toMatchObject({ segments: 0, remaining: 160 });
  });
});

describe("topWords", () => {
  it("ranks words, leaving out stop words and numbers", () => {
    const top = topWords("The cat sat. The cat ran! A dog sat 3 times; the Cat won.");
    expect(top.slice(0, 2)).toEqual([
      { word: "cat", count: 3, share: 3 / 14 },
      { word: "sat", count: 2, share: 2 / 14 },
    ]);
    expect(top.map((w) => w.word)).not.toContain("the");
    expect(top.map((w) => w.word)).not.toContain("3");
  });
});
