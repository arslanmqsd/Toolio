/**
 * Markdown ↔ HTML in the browser: marked (GitHub Flavored Markdown) one way, turndown with the GFM
 * plugin the other, and DOMPurify for the live preview. Nothing leaves the page.
 *
 * The HTML side needs a DOM (DOMParser, DOMPurify), so call these from the client or a jsdom test.
 */

import { gfm } from "@joplin/turndown-plugin-gfm";
import DOMPurify from "dompurify";
import { Marked } from "marked";
import TurndownService from "turndown";

export type Direction = "md-to-html" | "html-to-md";

export type ConvertResult = { ok: true; output: string; lossy: LossReport } | { ok: false; error: string };

/** What an HTML → Markdown conversion couldn't write as plain Markdown. Empty lists mean it was exact. */
export interface LossReport {
  /** Tags written into the Markdown as raw HTML, since Markdown has no syntax for them. */
  keptAsHtml: string[];
  /** Tags and attributes left out of the Markdown. */
  removed: string[];
}

const NO_LOSS: LossReport = { keptAsHtml: [], removed: [] };

const marked = new Marked({ gfm: true, breaks: false, async: false });

export function markdownToHtml(markdown: string): ConvertResult {
  try {
    return { ok: true, output: marked.parse(markdown) as string, lossy: NO_LOSS };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Code, not content: dropped from the Markdown, and reported. */
const REMOVED_TAGS = ["script", "style", "noscript", "template", "link", "meta", "base", "title"];

/** Content Markdown has no syntax for: kept as raw HTML, which Markdown allows, and reported. */
const RAW_HTML_TAGS = [
  "svg", "math", "form", "button", "select", "textarea", "label", "fieldset", "iframe", "object", "embed",
  "video", "audio", "picture", "canvas", "details", "dialog", "u", "sub", "sup", "mark", "kbd", "abbr",
];

const isCustomElement = (el: Element) => el.localName.includes("-");

/** A checkbox inside a list item; the GFM plugin writes it as "[x]". Any other input stays as HTML. */
const isTaskCheckbox = (el: Element) =>
  el.localName === "input" && el.getAttribute("type") === "checkbox" && el.closest("li") !== null;

function keepsAsHtml(el: Element): boolean {
  if (RAW_HTML_TAGS.includes(el.localName) || isCustomElement(el)) return true;
  return el.localName === "input" && !isTaskCheckbox(el);
}

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    hr: "---",
  });
  service.use(gfm);
  service.remove(REMOVED_TAGS as (keyof HTMLElementTagNameMap)[]);
  // Kept elements are written whole, with everything inside them.
  service.keep((node) => keepsAsHtml(node));

  // "- item" rather than turndown's "-   item", and one space after a task checkbox.
  service.addRule("listItem", {
    filter: "li",
    replacement(content, node, options) {
      const li = node as HTMLLIElement;
      const parent = li.parentElement;
      let prefix = `${options.bulletListMarker} `;
      if (parent?.localName === "ol") {
        const start = Number(parent.getAttribute("start") ?? 1);
        prefix = `${start + Array.prototype.indexOf.call(parent.children, li)}. `;
      }
      const isParagraph = /\n$/.test(content);
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "").replace(/^(\[[ x]\]) +/, "$1 ");
      const indented = (body + (isParagraph ? "\n" : "")).replace(/\n/g, `\n${" ".repeat(prefix.length)}`);
      return prefix + indented + (li.nextSibling ? "\n" : "");
    },
  });

  // A link whose text is its own URL reads better as <url>.
  service.addRule("autolink", {
    filter: (node) => node.localName === "a" && !!node.getAttribute("href") && node.textContent === node.getAttribute("href") && !node.getAttribute("title"),
    replacement: (content, node) => `<${(node as HTMLAnchorElement).getAttribute("href")}>`,
  });

  // <pre> without <code> inside is still preformatted text.
  service.addRule("plainPre", {
    filter: (node) => node.localName === "pre" && node.firstElementChild?.localName !== "code",
    replacement: (content, node) => `\n\n\`\`\`\n${node.textContent?.replace(/\n$/, "") ?? ""}\n\`\`\`\n\n`,
  });

  return service;
}

function insideKeptOrRemoved(node: Element): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (keepsAsHtml(el) || REMOVED_TAGS.includes(el.localName)) return true;
  }
  return false;
}

/** Lists, in document order, what Markdown can't express. What's inside a kept or removed element isn't listed again. */
export function findLosses(root: Element): LossReport {
  const keptAsHtml = new Set<string>();
  const removed = new Set<string>();
  for (const el of root.querySelectorAll("*")) {
    if (insideKeptOrRemoved(el)) continue;
    if (REMOVED_TAGS.includes(el.localName)) removed.add(`<${el.localName}>`);
    else if (keepsAsHtml(el)) keptAsHtml.add(`<${el.localName}>`);
    else {
      if (el.hasAttribute("style")) removed.add("style attributes");
      if ([...el.attributes].some((a) => a.name.startsWith("on"))) removed.add("event handler attributes");
    }
  }
  return { keptAsHtml: [...keptAsHtml], removed: [...removed] };
}

const PLACEHOLDER = /\uE000(\d+)\uE001/g;

/**
 * Turndown drops elements with no text, like <svg> or <canvas>, before its keep rules run, and trims
 * the space beside them. Swapping each for a text placeholder keeps both; the caller puts the HTML back.
 */
function replaceTextlessKept(root: Element): string[] {
  const html: string[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (!keepsAsHtml(el) || insideKeptOrRemoved(el) || el.textContent?.trim()) continue;
    el.replaceWith(root.ownerDocument.createTextNode(`\uE000${html.length}\uE001`));
    html.push(el.outerHTML);
  }
  return html;
}

/**
 * Accepts a full document or a fragment; for a document only the <body> is converted. HTML is
 * forgiving, so any string parses.
 */
export function htmlToMarkdown(html: string): ConvertResult {
  try {
    const body = new DOMParser().parseFromString(html, "text/html").body;
    const lossy = findLosses(body);
    const placeholders = replaceTextlessKept(body);
    const output = createTurndown()
      .turndown(body)
      .replace(PLACEHOLDER, (_, i: string) => placeholders[Number(i)]);
    // The GFM plugin writes tables it can't express (merged cells, block content) as HTML.
    if (body.querySelector("table") && /<table[\s>]/i.test(output)) lossy.keptAsHtml.push("<table>");
    return { ok: true, output, lossy };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function convert(text: string, direction: Direction): ConvertResult {
  return direction === "md-to-html" ? markdownToHtml(text) : htmlToMarkdown(text);
}

let purifier: ReturnType<typeof DOMPurify> | undefined;

/**
 * Cleans HTML for the preview: no <script>, no on* handlers, no javascript: links. DOMPurify's
 * default URL rules also block data: in links but allow data: images, which can't run code.
 * Only the preview is cleaned; the copyable output stays exactly as converted.
 */
export function sanitizeHtml(html: string): string {
  if (!purifier) {
    // An instance of our own, so the hook doesn't change DOMPurify for anything else on the page.
    purifier = DOMPurify(window);
    purifier.addHook("afterSanitizeAttributes", (node) => {
      if (node.localName === "a") node.setAttribute("rel", "noopener noreferrer");
    });
  }
  return purifier.sanitize(html);
}

/**
 * A complete page for a sandboxed iframe's srcdoc. The CSP is a third layer after DOMPurify and the
 * sandbox: no scripts, no frames, nothing fetched except images. `css` styles the page.
 */
export function previewDocument(sanitizedHtml: string, css: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>${css}</style>
</head>
<body>${sanitizedHtml}</body>
</html>`;
}

export interface TextStats {
  bytes: number;
  words: number;
  lines: number;
}

export function textStats(text: string): TextStats {
  return {
    bytes: new TextEncoder().encode(text).length,
    words: text.match(/\S+/g)?.length ?? 0,
    lines: text === "" ? 0 : text.split(/\r?\n/).length,
  };
}
