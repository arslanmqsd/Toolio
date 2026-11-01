import { describe, expect, it } from "vitest";
import { PREVIEW_CSP } from "@/lib/html-preview";
import { DEFAULT_SETUP, pageMm, printableWidthPx, printCss, printDocument, type PageSetup } from "./html-to-pdf";

const setup = (over: Partial<PageSetup> = {}): PageSetup => ({ ...DEFAULT_SETUP, ...over });

describe("pageMm", () => {
  it("gives each paper size in millimetres", () => {
    expect(pageMm(setup({ size: "a4" }))).toEqual([210, 297]);
    expect(pageMm(setup({ size: "letter" }))).toEqual([215.9, 279.4]);
    expect(pageMm(setup({ size: "legal" }))).toEqual([215.9, 355.6]);
  });

  it("turns the page for landscape", () => {
    expect(pageMm(setup({ size: "a4", orientation: "landscape" }))).toEqual([297, 210]);
  });
});

describe("printableWidthPx", () => {
  it("is the full page width with no margins (A4 is 794 px at 96 dpi)", () => {
    expect(printableWidthPx(setup({ margin: "none" }))).toBe(794);
  });

  it("takes both side margins off", () => {
    expect(printableWidthPx(setup({ margin: "small" }))).toBe(718);
    expect(printableWidthPx(setup({ margin: "normal" }))).toBe(643);
  });

  it("is wider in landscape", () => {
    expect(printableWidthPx(setup({ orientation: "landscape", margin: "none" }))).toBe(1123);
  });

  it("uses Letter's width", () => {
    expect(printableWidthPx(setup({ size: "letter", margin: "none" }))).toBe(816);
  });
});

describe("printCss", () => {
  it("sets the paper size, orientation and margin", () => {
    expect(printCss(setup({ size: "letter", orientation: "landscape", margin: "normal" }))).toContain("@page { size: letter landscape; margin: 20mm; }");
  });

  it("keeps background colours when asked", () => {
    expect(printCss(setup({ backgrounds: true }))).toContain("print-color-adjust: exact");
  });

  it("leaves backgrounds to the browser otherwise", () => {
    expect(printCss(setup({ backgrounds: false }))).not.toContain("print-color-adjust");
  });
});

describe("printDocument", () => {
  const doc = printDocument("<h1>Invoice</h1>", ' class="dark"', DEFAULT_SETUP, "Invoice <42> & co");

  it("blocks scripts and fetches with the preview's CSP", () => {
    expect(doc).toContain(`content="${PREVIEW_CSP}"`);
  });

  it("puts the escaped title in, for the PDF's file name", () => {
    expect(doc).toContain("<title>Invoice &lt;42&gt; &amp; co</title>");
  });

  it("keeps the body and its attributes", () => {
    expect(doc).toContain('<body class="dark"><h1>Invoice</h1>');
  });

  it("puts the page setup after the page's own styles, so it wins", () => {
    expect(doc.indexOf("<h1>Invoice</h1>")).toBeLessThan(doc.indexOf("@page"));
  });

  it("prints on white like a browser, unless the page says otherwise", () => {
    expect(doc.indexOf("background: #fff")).toBeLessThan(doc.indexOf("<body"));
  });
});
