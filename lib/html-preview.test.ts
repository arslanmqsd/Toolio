// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PREVIEW_CSP, previewDocument, sanitizeHtml, sanitizePage } from "./html-preview";

describe("sanitizeHtml", () => {
  // The payloads every preview must neutralize.
  it("removes scripts, event handlers and javascript: links", () => {
    const clean = sanitizeHtml('<script>alert(document.domain)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>');
    expect(clean).not.toMatch(/<script|onerror|javascript:/i);
    expect(clean).toBe('<img src="x"><a rel="noopener noreferrer">x</a>');
  });

  it("blocks data: links but keeps data: images", () => {
    expect(sanitizeHtml('<a href="data:text/html,<script>1</script>">x</a>')).toBe('<a rel="noopener noreferrer">x</a>');
    expect(sanitizeHtml('<img src="data:image/png;base64,AA==">')).toBe('<img src="data:image/png;base64,AA==">');
  });

  it("keeps task list checkboxes and code classes", () => {
    const html = '<li><input checked="" disabled="" type="checkbox"> done</li><code class="language-ts">x</code>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});

describe("sanitizePage", () => {
  const page = `<!DOCTYPE html><html lang="en"><head><title>T</title>
<meta http-equiv="refresh" content="0;url=https://example.com">
<link rel="stylesheet" href="https://example.com/a.css">
<style>body { color: red }</style>
<base href="https://example.com/">
<script>alert(1)</script>
</head><body class="dark" style="margin:0" onload="alert(1)"><style>p { color: blue }</style>
<p>hi</p><iframe src="https://example.com"></iframe><img src="https://example.com/i.png"></body></html>`;

  it("keeps the page's styles and body attributes, and removes what loads, redirects or runs", () => {
    const clean = sanitizePage(page);
    expect(clean.bodyAttributes).toBe(' class="dark" style="margin:0"');
    expect(clean.body).toContain("<style>body { color: red }</style>");
    expect(clean.body).toContain("<style>p { color: blue }</style>");
    expect(clean.body).toContain('<img src="https://example.com/i.png">');
    const all = Object.values(clean).join("");
    expect(all).not.toMatch(/<script|onload|<iframe|<link|<meta|<base|refresh/i);
  });

  it("keeps a <style> at the start of a fragment", () => {
    expect(sanitizePage("<style>p{}</style><p>x</p>").body).toBe("<style>p{}</style><p>x</p>");
  });

  it("escapes body attribute values", () => {
    expect(sanitizePage(`<body title='a"b<c&'><p>x</p></body>`).bodyAttributes).toBe(' title="a&quot;b&lt;c&amp;"');
  });
});

describe("previewDocument", () => {
  it("adds a CSP that blocks scripts and everything fetched but images, and opens links outside the frame", () => {
    const doc = previewDocument("<p>x</p>", "body{}");
    expect(PREVIEW_CSP).toBe("default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline'; form-action 'none'");
    expect(doc).toContain(`content="${PREVIEW_CSP}"`);
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain("<body><p>x</p></body>");
  });

  it("puts the HTML's own styles after the base CSS, and body attributes on <body>", () => {
    const doc = previewDocument("<style>own{}</style><p>x</p>", "base{}", ' class="a"');
    expect(doc.indexOf("base{}")).toBeLessThan(doc.indexOf("own{}"));
    expect(doc).toContain('<body class="a"><style>own{}</style><p>x</p></body>');
  });
});
