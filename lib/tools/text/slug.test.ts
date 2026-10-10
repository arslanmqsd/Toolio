import { describe, expect, it } from "vitest";
import { DEFAULT_SLUG, parseReplacements, slugify, slugifyLines, type SlugOptions } from "./slug";
import { transliterate } from "./transliterate";

const lines = (text: string, options: Partial<SlugOptions> = {}) => slugifyLines(text, { ...DEFAULT_SLUG, ...options });
const slugs = (text: string, options: Partial<SlugOptions> = {}) => lines(text, options).lines.map((l) => l.slug);

describe("transliterate", () => {
  it("strips accents and spells letters that don't decompose", () => {
    expect(transliterate("Crème brûlée")).toBe("Creme brulee");
    expect(transliterate("Straße, Ærø, Łódź, Þór, ıi")).toBe("Strasse, Aero, Lodz, Thor, ii");
  });

  it("romanises Cyrillic and Greek, keeping capitals", () => {
    expect(transliterate("Привет, мир")).toBe("Privet, mir");
    expect(transliterate("Щука Юля")).toBe("Shchuka Yulya");
    expect(transliterate("Αθήνα")).toBe("Athina");
  });

  it("unfolds ligatures and full-width forms", () => {
    expect(transliterate("ﬁle Ａ１")).toBe("file A1");
  });

  it("leaves scripts with no Latin spelling as they are, marks included", () => {
    expect(transliterate("東京")).toBe("東京");
    expect(transliterate("नमस्ते")).toBe("नमस्ते");
  });
});

describe("slugify", () => {
  it("lower-cases words and joins them with hyphens", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("10 Tips for Next.js 15")).toBe("10-tips-for-next-js-15");
  });

  it("drops apostrophes inside words", () => {
    expect(slugify("Don't Stop Believin’")).toBe("dont-stop-believin");
  });

  it("replaces & with and, as its own word", () => {
    expect(slugify("Tom&Jerry")).toBe("tom-and-jerry");
    expect(slugify("Tom & Jerry", { replacements: [] })).toBe("tom-jerry");
  });

  it("uses the chosen separator and keeps case on request", () => {
    expect(slugify("My Great Post", { separator: "_", lowercase: false })).toBe("My_Great_Post");
    expect(slugify("My Great Post", { separator: "." })).toBe("my.great.post");
  });

  it("removes stop words unless nothing would be left", () => {
    expect(slugify("The Lord of the Rings", { removeStopWords: true })).toBe("lord-rings");
    expect(slugify("To Be or Not", { removeStopWords: true })).toBe("not");
    expect(slugify("The And Of", { removeStopWords: true })).toBe("the-and-of");
  });

  it("cuts at a word boundary, or cuts one long word", () => {
    expect(slugify("one two three four", { maxLength: 10 })).toBe("one-two");
    expect(slugify("supercalifragilistic", { maxLength: 5 })).toBe("super");
    expect(slugify("one two", { maxLength: 7 })).toBe("one-two");
  });

  it("drops or keeps non-Latin letters", () => {
    expect(slugify("Tokyo 東京 guide")).toBe("tokyo-guide");
    expect(slugify("Tokyo 東京 guide", { keepUnicode: true })).toBe("tokyo-東京-guide");
    expect(slugify("नमस्ते दुनिया", { keepUnicode: true })).toBe("नमस्ते-दुनिया");
  });
});

describe("slugifyLines", () => {
  it("gives one slug per line, keeping blank lines so output lines up", () => {
    expect(slugs("First Post\n\nSecond Post\r\nThird")).toEqual(["first-post", "", "second-post", "third"]);
    expect(lines("A\n\nB").output).toBe("a\n\nb");
  });

  it("numbers repeats, skipping numbers already taken", () => {
    expect(slugs("Post\nPost\nPost")).toEqual(["post", "post-2", "post-3"]);
    expect(slugs("Post 2\nPost\nPost")).toEqual(["post-2", "post", "post-3"]);
    expect(slugs("Post\nPost", { unique: false })).toEqual(["post", "post"]);
    expect(lines("Post\nPost").notices).toContainEqual({ kind: "info", message: "Numbered 1 repeated slug so each one is unique." });
  });

  it("keeps numbered slugs within the length limit", () => {
    expect(slugs("abcdefgh\nabcdefgh", { maxLength: 8 })).toEqual(["abcdefgh", "abcdef-2"]);
    expect(slugs("ab-cd ef\nab cd ef", { maxLength: 7 })).toEqual(["ab-cd", "ab-cd-2"]);
  });

  it("warns about lines with nothing to slug and letters it left out", () => {
    const result = lines("!!!\n東京\nok");
    expect(result.lines.map((l) => l.slug)).toEqual(["", "", "ok"]);
    expect(result.notices.map((n) => n.kind)).toEqual(["warning", "warning"]);
    expect(result.notices[0].message).toContain("2 lines give an empty slug (line 1 and 2)");
    expect(result.notices[1].message).toContain("東 and 京");
  });

  it("says how many slugs were shortened", () => {
    expect(lines("one two three", { maxLength: 7 }).notices).toContainEqual({ kind: "info", message: "Shortened 1 slug to 7 characters." });
  });

  it("writes a title,slug CSV, quoting and escaping titles", () => {
    const result = lines('Hello, "World"\n\n=SUM(A1)', { format: "csv" });
    expect(result.output).toBe('title,slug\n"Hello, ""World""",hello-world\n\'=SUM(A1),sum-a1\n');
    expect(result.notices.at(-1)?.kind).toBe("info");
  });
});

describe("parseReplacements", () => {
  it("reads from=to lines, flagging ones without =", () => {
    expect(parseReplacements("& = and\n\n==equals\n+=plus\nnope")).toEqual({
      replacements: [
        { from: "&", to: "and" },
        { from: "=", to: "equals" },
        { from: "+", to: "plus" },
      ],
      invalidLines: [5],
    });
  });

  it("replaces with nothing when the right side is empty", () => {
    expect(slugify("C# rocks", { replacements: [{ from: "#", to: "sharp" }] })).toBe("c-sharp-rocks");
    expect(parseReplacements("™=").replacements).toEqual([{ from: "™", to: "" }]);
  });
});
