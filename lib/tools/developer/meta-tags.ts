/**
 * Open Graph, X (Twitter) card and basic SEO tags: read from pasted HTML, resolved the way each
 * platform falls back from one tag to another, checked against what platforms need, and written
 * back out as a <head> block. Parsing needs a DOM, so call parseMetaTags from the client or a jsdom test.
 */

export interface MetaTags {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogImageAlt: string;
  ogUrl: string;
  ogSiteName: string;
  ogType: string;
  twitterCard: string;
  twitterSite: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  themeColor: string;
}

export const EMPTY_TAGS: MetaTags = {
  title: "",
  description: "",
  canonical: "",
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  ogImageAlt: "",
  ogUrl: "",
  ogSiteName: "",
  ogType: "",
  twitterCard: "",
  twitterSite: "",
  twitterTitle: "",
  twitterDescription: "",
  twitterImage: "",
  themeColor: "",
};

// <meta> keys, matched case-insensitively against property= or name=, as platforms accept either.
const META_KEYS: [keyof MetaTags, string][] = [
  ["description", "description"],
  ["ogTitle", "og:title"],
  ["ogDescription", "og:description"],
  ["ogImage", "og:image"],
  ["ogImage", "og:image:url"],
  ["ogImage", "og:image:secure_url"],
  ["ogImageAlt", "og:image:alt"],
  ["ogUrl", "og:url"],
  ["ogSiteName", "og:site_name"],
  ["ogType", "og:type"],
  ["twitterCard", "twitter:card"],
  ["twitterSite", "twitter:site"],
  ["twitterTitle", "twitter:title"],
  ["twitterDescription", "twitter:description"],
  ["twitterImage", "twitter:image"],
  ["twitterImage", "twitter:image:src"],
  ["themeColor", "theme-color"],
];

export interface ParseResult {
  tags: MetaTags;
  /** How many of the tags this tool knows were found. */
  found: number;
}

/** Reads the tags from a whole page, its <head>, or just some <meta> lines. The first of each wins, as on Facebook and X. */
export function parseMetaTags(html: string): ParseResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tags = { ...EMPTY_TAGS };
  const metas = new Map<string, string>();
  for (const meta of doc.querySelectorAll("meta")) {
    const key = (meta.getAttribute("property") ?? meta.getAttribute("name") ?? "").trim().toLowerCase();
    const content = meta.getAttribute("content");
    if (key && content !== null && !metas.has(key)) metas.set(key, content.trim());
  }
  for (const [field, key] of META_KEYS) {
    if (!tags[field] && metas.has(key)) tags[field] = metas.get(key)!;
  }
  tags.title = doc.querySelector("title")?.textContent?.trim() ?? "";
  tags.canonical = doc.querySelector('link[rel~="canonical" i]')?.getAttribute("href")?.trim() ?? "";
  const found = (Object.keys(tags) as (keyof MetaTags)[]).filter((k) => tags[k]).length;
  return { tags, found };
}

export type CardSize = "summary" | "summary_large_image";

/** What one platform shows, after its fallbacks. */
export interface Resolved {
  pageTitle: string;
  title: string;
  description: string;
  /** Absolute when it can be: a relative image is resolved against the page URL, so it can still be previewed. */
  image: string;
  imageAlt: string;
  url: string;
  /** "example.com", or "" without a page URL. */
  domain: string;
  siteName: string;
  themeColor: string;
  x: { title: string; description: string; image: string; card: CardSize };
}

export const isAbsoluteUrl = (url: string) => /^https?:\/\//i.test(url);

function resolveUrl(url: string, base: string): string {
  if (!url || isAbsoluteUrl(url)) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function resolveTags(tags: MetaTags): Resolved {
  const url = tags.ogUrl || tags.canonical;
  const base = isAbsoluteUrl(url) ? url : "";
  const image = resolveUrl(tags.ogImage, base);
  const title = tags.ogTitle || tags.title;
  const description = tags.ogDescription || tags.description;
  const xImage = tags.twitterImage ? resolveUrl(tags.twitterImage, base) : image;
  return {
    pageTitle: tags.title || tags.ogTitle,
    title,
    description,
    image,
    imageAlt: tags.ogImageAlt,
    url,
    domain: domainOf(url),
    siteName: tags.ogSiteName,
    themeColor: tags.themeColor,
    x: {
      title: tags.twitterTitle || title,
      description: tags.twitterDescription || description,
      image: xImage,
      // X shows the small card when twitter:card is missing or unknown.
      card: tags.twitterCard === "summary_large_image" ? "summary_large_image" : "summary",
    },
  };
}

/** The image's size once loaded, or "error" when it couldn't be loaded. */
export type ImageInfo = { width: number; height: number } | "error" | null;

export interface Check {
  level: "error" | "warning";
  message: string;
}

/** Google shows about this much of a title and a description. */
export const TITLE_LIMIT = 60;
export const DESCRIPTION_LIMIT = 160;

export function checkTags(tags: MetaTags, image: ImageInfo = null): Check[] {
  const r = resolveTags(tags);
  const checks: Check[] = [];
  const error = (message: string) => checks.push({ level: "error", message });
  const warn = (message: string) => checks.push({ level: "warning", message });

  if (!r.title) error("No title. Add <title> and og:title.");
  else {
    if (!tags.title) warn("No <title>. Search results and browser tabs use it.");
    if (!tags.ogTitle) warn("No og:title. Platforms fall back to <title>, but og:title is what they look for first.");
    if (r.title.length > TITLE_LIMIT) warn(`Title is ${r.title.length} characters. Search results cut it off after about ${TITLE_LIMIT}.`);
  }

  if (!r.description) warn("No description. Add a meta description and og:description, or platforms may pick text from the page.");
  else if (r.description.length > DESCRIPTION_LIMIT)
    warn(`Description is ${r.description.length} characters. Search results cut it off after about ${DESCRIPTION_LIMIT}.`);

  if (!tags.ogImage) error("No og:image, so links show without a picture.");
  else {
    if (!isAbsoluteUrl(tags.ogImage)) error("og:image is a relative URL. Platforms need the full address, starting with https://.");
    else if (/^http:/i.test(tags.ogImage)) warn("og:image uses http://. Some platforms only load images over https://.");
    if (!tags.ogImageAlt) warn("No og:image:alt, so people using screen readers don't know what the image shows.");
    if (image === "error") error("The image couldn't be loaded. Check the URL, and that the server doesn't block other sites.");
    else if (image) {
      const { width, height } = image;
      if (width < 200 || height < 200) error(`The image is ${width}×${height}. Facebook ignores images smaller than 200×200.`);
      else if (width < 1200 || height < 630) warn(`The image is ${width}×${height}. 1200×630 or larger looks sharp everywhere.`);
      const ratio = width / height;
      if (ratio < 1.7 || ratio > 2.1) warn(`The image is ${ratio.toFixed(2)}:1. Large cards crop to about 1.91:1, so edges may be cut off.`);
    }
  }

  if (!r.url) warn("No og:url or canonical link. Platforms use it to group shares of the same page.");
  else if (!isAbsoluteUrl(r.url)) error("The page URL is relative. og:url and the canonical link must be full addresses.");

  if (!tags.twitterCard) warn("No twitter:card, so X shows the small card. Use summary_large_image for a big picture.");
  else if (tags.twitterCard !== "summary" && tags.twitterCard !== "summary_large_image")
    warn(`twitter:card is "${tags.twitterCard}". Use summary or summary_large_image.`);

  return checks;
}

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The tags as a <head> block. og:title and og:description are written even when only <title> and
 * the description are filled in, so platforms that don't fall back still find them.
 */
export function generateTags(tags: MetaTags): string {
  const r = resolveTags(tags);
  const lines: string[] = [];
  const meta = (attr: "name" | "property", key: string, value: string) => {
    if (value) lines.push(`<meta ${attr}="${key}" content="${escapeAttr(value)}" />`);
  };
  if (r.pageTitle) lines.push(`<title>${escapeText(r.pageTitle)}</title>`);
  meta("name", "description", tags.description || tags.ogDescription);
  if (tags.canonical || tags.ogUrl) lines.push(`<link rel="canonical" href="${escapeAttr(tags.canonical || tags.ogUrl)}" />`);
  meta("name", "theme-color", tags.themeColor);
  if (lines.length) lines.push("");

  meta("property", "og:type", tags.ogType || "website");
  meta("property", "og:title", r.title);
  meta("property", "og:description", r.description);
  meta("property", "og:url", tags.ogUrl || tags.canonical);
  meta("property", "og:site_name", tags.ogSiteName);
  meta("property", "og:image", tags.ogImage);
  meta("property", "og:image:alt", tags.ogImageAlt);
  lines.push("");

  meta("name", "twitter:card", tags.twitterCard || (tags.ogImage ? "summary_large_image" : "summary"));
  meta("name", "twitter:site", tags.twitterSite);
  meta("name", "twitter:title", tags.twitterTitle);
  meta("name", "twitter:description", tags.twitterDescription);
  meta("name", "twitter:image", tags.twitterImage);

  return lines.join("\n").replace(/\n+$/, "") + "\n";
}
