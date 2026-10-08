/**
 * Safe rendering of HTML that may be hostile, for a sandboxed iframe's srcdoc. DOMPurify strips
 * scripts, handlers and javascript: links; the CSP in previewDocument blocks scripts again and
 * stops anything but images from being fetched. Needs a DOM, so call from the client or a jsdom test.
 */
import DOMPurify from "dompurify";

let purifier: ReturnType<typeof DOMPurify> | undefined;

function getPurifier() {
  if (!purifier) {
    // An instance of our own, so the hook doesn't change DOMPurify for anything else on the page.
    purifier = DOMPurify(window);
    purifier.addHook("afterSanitizeAttributes", (node) => {
      if (node.localName === "a") node.setAttribute("rel", "noopener noreferrer");
    });
  }
  return purifier;
}

/**
 * Cleans an HTML fragment: no <script>, no on* handlers, no javascript: links. DOMPurify's default
 * URL rules also block data: in links but allow data: images, which can't run code.
 */
export function sanitizeHtml(html: string): string {
  return getPurifier().sanitize(html);
}

export interface SanitizedPage {
  /** The body's attributes that survived, such as class and style, as written in a start tag. */
  bodyAttributes: string;
  /** The body, with the page's <style> elements from <head> at the start. */
  body: string;
}

/**
 * Cleans a whole page, or a fragment, keeping its <style> elements so it renders with its own CSS.
 * <link>, <meta>, <base> and <iframe> are removed, so nothing is loaded and nothing redirects.
 */
export function sanitizePage(html: string): SanitizedPage {
  const root = getPurifier().sanitize(html, { WHOLE_DOCUMENT: true, RETURN_DOM: true, FORCE_BODY: true }) as unknown as HTMLElement;
  // FORCE_BODY keeps a <style> that starts a fragment, and moves <head> styles into the body.
  const headStyles = [...root.querySelectorAll("head style")].map((s) => s.outerHTML).join("");
  const body = root.querySelector("body");
  const bodyAttributes = [...(body?.attributes ?? [])].map((a) => ` ${a.name}="${escapeAttribute(a.value)}"`).join("");
  return { bodyAttributes, body: headStyles + (body?.innerHTML ?? "") };
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The Content Security Policy for every preview: no scripts, frames, fonts, stylesheets or requests
 * of any kind; only images, inline styles, and nothing submitted.
 */
export const PREVIEW_CSP = "default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline'; form-action 'none'";

/**
 * A complete page for a sandboxed iframe's srcdoc, from sanitized HTML. `css` comes before any
 * styles in the HTML, so they win. Links open in a new tab, without a referrer.
 */
export function previewDocument(sanitizedHtml: string, css: string, bodyAttributes = ""): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>${css}</style>
</head>
<body${bodyAttributes}>${sanitizedHtml}</body>
</html>`;
}
