// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EMPTY_TAGS, checkTags, generateTags, parseMetaTags, resolveTags, type MetaTags } from "./meta-tags";

const tags = (overrides: Partial<MetaTags>): MetaTags => ({ ...EMPTY_TAGS, ...overrides });

const FULL = tags({
  title: "Toolio",
  description: "Free online tools.",
  ogTitle: "Toolio",
  ogDescription: "Free online tools.",
  ogImage: "https://toolio.dev/og.png",
  ogImageAlt: "Toolio logo",
  ogUrl: "https://toolio.dev/",
  twitterCard: "summary_large_image",
});

describe("parseMetaTags", () => {
  it("reads a page's head, with property= or name=, in any case", () => {
    const { tags: t, found } = parseMetaTags(`<!doctype html><html><head>
      <title> My Page </title>
      <meta name="description" content="About it">
      <link rel="Canonical" href="https://example.com/page">
      <meta property="OG:TITLE" content="Share title">
      <meta name="og:image" content="https://example.com/a.png">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="theme-color" content="#123456">
    </head><body><meta property="og:title" content="Ignored"></body></html>`);
    expect(t).toMatchObject({
      title: "My Page",
      description: "About it",
      canonical: "https://example.com/page",
      ogTitle: "Share title",
      ogImage: "https://example.com/a.png",
      twitterCard: "summary_large_image",
      themeColor: "#123456",
    });
    expect(found).toBe(7);
  });

  it("reads bare <meta> lines and decodes entities", () => {
    const { tags: t } = parseMetaTags(`<meta property="og:title" content="Tom &amp; Jerry">\n<meta property="og:image:secure_url" content="https://x.dev/i.png">`);
    expect(t.ogTitle).toBe("Tom & Jerry");
    expect(t.ogImage).toBe("https://x.dev/i.png");
  });

  it("finds nothing in text without tags", () => {
    expect(parseMetaTags("just text").found).toBe(0);
  });
});

describe("resolveTags", () => {
  it("falls back from og: to plain tags, and from twitter: to og:", () => {
    const r = resolveTags(tags({ title: "Page", description: "Desc", ogImage: "/img.png", canonical: "https://www.example.com/a" }));
    expect(r).toMatchObject({ title: "Page", description: "Desc", image: "https://www.example.com/img.png", domain: "example.com" });
    expect(r.x).toEqual({ title: "Page", description: "Desc", image: "https://www.example.com/img.png", card: "summary" });
  });

  it("prefers twitter: tags on X", () => {
    const r = resolveTags(tags({ ogTitle: "OG", twitterTitle: "X title", twitterCard: "summary_large_image" }));
    expect(r.title).toBe("OG");
    expect(r.x).toMatchObject({ title: "X title", card: "summary_large_image" });
  });
});

describe("checkTags", () => {
  const messages = (t: MetaTags, image?: Parameters<typeof checkTags>[1]) => checkTags(t, image).map((c) => `${c.level}: ${c.message}`);

  it("passes complete tags with a good image", () => {
    expect(checkTags(FULL, { width: 1200, height: 630 })).toEqual([]);
  });

  it("flags missing essentials", () => {
    const result = messages(EMPTY_TAGS);
    expect(result).toContain("error: No title. Add <title> and og:title.");
    expect(result).toContain("error: No og:image, so links show without a picture.");
    expect(result.some((m) => m.startsWith("warning: No twitter:card"))).toBe(true);
  });

  it("flags relative and http images, and images that are small, odd-shaped or broken", () => {
    expect(messages({ ...FULL, ogImage: "/og.png" })).toContain(
      "error: og:image is a relative URL. Platforms need the full address, starting with https://.",
    );
    expect(messages({ ...FULL, ogImage: "http://toolio.dev/og.png" }).some((m) => m.includes("http://"))).toBe(true);
    expect(messages(FULL, { width: 150, height: 150 }).some((m) => m.startsWith("error: The image is 150×150"))).toBe(true);
    expect(messages(FULL, { width: 800, height: 800 })).toEqual([
      "warning: The image is 800×800. 1200×630 or larger looks sharp everywhere.",
      "warning: The image is 1.00:1. Large cards crop to about 1.91:1, so edges may be cut off.",
    ]);
    expect(messages(FULL, "error")[0]).toMatch(/^error: The image couldn't be loaded/);
  });

  it("warns about long titles and descriptions", () => {
    const result = messages({ ...FULL, ogTitle: "x".repeat(70), ogDescription: "y".repeat(170) });
    expect(result).toContain("warning: Title is 70 characters. Search results cut it off after about 60.");
    expect(result).toContain("warning: Description is 170 characters. Search results cut it off after about 160.");
  });
});

describe("generateTags", () => {
  it("writes og: tags from the plain ones and escapes values", () => {
    const html = generateTags(tags({ title: 'Tom & "Jerry" <3', description: "Fun", ogImage: "https://x.dev/i.png", ogUrl: "https://x.dev/" }));
    expect(html).toBe(
      [
        "<title>Tom &amp; \"Jerry\" &lt;3</title>",
        '<meta name="description" content="Fun" />',
        '<link rel="canonical" href="https://x.dev/" />',
        "",
        '<meta property="og:type" content="website" />',
        '<meta property="og:title" content="Tom &amp; &quot;Jerry&quot; &lt;3" />',
        '<meta property="og:description" content="Fun" />',
        '<meta property="og:url" content="https://x.dev/" />',
        '<meta property="og:image" content="https://x.dev/i.png" />',
        "",
        '<meta name="twitter:card" content="summary_large_image" />',
        "",
      ].join("\n"),
    );
  });

  it("round-trips through the parser", () => {
    const { tags: parsed } = parseMetaTags(generateTags(FULL));
    expect(parsed).toEqual({ ...FULL, canonical: "https://toolio.dev/", ogType: "website", description: "Free online tools." });
  });
});
