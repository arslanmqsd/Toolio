// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FORMAT, DEFAULT_MINIFY, formatHtml, gzipSize, minifyHtml, processHtml, type HtmlResult } from "./html-format";

async function ok(result: Promise<HtmlResult>) {
  const r = await result;
  if (!r.ok) throw new Error(`unexpected error: ${r.error.message}`);
  return r;
}

const format = (text: string, options: Partial<typeof DEFAULT_FORMAT> = {}) => ok(formatHtml(text, { ...DEFAULT_FORMAT, ...options }));
const minify = (text: string, options: Partial<typeof DEFAULT_MINIFY> = {}) => ok(minifyHtml(text, { ...DEFAULT_MINIFY, ...options }));

describe("formatHtml", () => {
  it("indents nested elements, 2 spaces by default", async () => {
    expect((await format("<ul><li>a</li><li>b</li></ul>")).output).toBe("<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>\n");
  });

  it("indents with 4 spaces or tabs when asked", async () => {
    expect((await format("<div>\n<p>a</p>\n</div>", { indent: "4" })).output).toBe("<div>\n    <p>a</p>\n</div>\n");
    expect((await format("<div>\n<p>a</p>\n</div>", { indent: "tab" })).output).toBe("<div>\n\t<p>a</p>\n</div>\n");
  });

  it("doesn't add or remove space between inline elements", async () => {
    expect((await format("<p>Hi <b>there</b><i>!</i></p>")).output).toBe("<p>Hi <b>there</b><i>!</i></p>\n");
  });

  it("keeps the text of <pre> and <textarea> exactly", async () => {
    const src = "<div><pre>  a\n    b  </pre><textarea>  x\n y</textarea></div>";
    // A line break right after <pre> or <textarea> isn't part of the text, so Prettier may add one.
    const read = (markup: string) => {
      const doc = new DOMParser().parseFromString(markup, "text/html");
      return [doc.querySelector("pre")!.textContent, doc.querySelector("textarea")!.value];
    };
    expect(read((await format(src)).output)).toEqual(["  a\n    b  ", "  x\n y"]);
  });

  it("formats inline CSS and JS, or leaves them alone", async () => {
    const src = "<style>p{color:red}</style><script>let a=1</script>";
    const out = (await format(src)).output;
    expect(out).toContain("p {\n    color: red;\n  }");
    expect(out).toContain("let a = 1;");
    const off = (await format(src, { formatEmbedded: false })).output;
    expect(off).toContain("p{color:red}");
    expect(off).toContain("let a=1");
  });

  it("wraps at the line width", async () => {
    const text = "<p>" + "word ".repeat(30).trim() + "</p>";
    const narrow = (await format(text, { printWidth: 40 })).output;
    const wide = (await format(text, { printWidth: 200 })).output;
    expect(Math.max(...narrow.split("\n").map((l) => l.length))).toBeLessThanOrEqual(40);
    expect(wide.trim().split("\n")).toHaveLength(1);
  });

  it("reports tags that don't match with a position", async () => {
    const result = await formatHtml("<div>\n  <span>x</div>", DEFAULT_FORMAT);
    expect(result).toMatchObject({ ok: false, error: { line: 2, column: 10 } });
    if (!result.ok) {
      expect(result.error.message).toMatch(/closing tag "div"/);
      expect(result.error.message).not.toMatch(/\n|https?:|\(\d+:\d+\)/);
    }
  });

  it("gives empty input as empty output", async () => {
    expect((await format("  \n")).output).toBe("");
  });
});

describe("minifyHtml", () => {
  it("removes comments, keeping conditional comments and <!--! ones", async () => {
    const out = (await minify("<p>a</p><!-- note --><!--[if IE]><p>ie</p><![endif]--><!--! license -->")).output;
    expect(out).not.toContain("note");
    expect(out).toContain("<!--[if IE]>");
    expect(out).toContain("license");
    expect((await minify("<!-- note -->", { removeComments: false })).output).toContain("note");
  });

  it("by default collapses whitespace to one space but never removes it", async () => {
    const out = (await minify('<div class="tile">1</div>\n  <div class="tile">2</div>\n<p>Hi\n   <b>there</b></p>')).output;
    expect(out).toBe('<div class="tile">1</div> <div class="tile">2</div> <p>Hi <b>there</b></p>');
  });

  it("removes whitespace between blocks when aggressive, keeping it between words", async () => {
    const out = (await minify("<div>1</div>\n  <div>2</div>\n<p>Hi\n   <b>there</b></p>", { whitespace: "aggressive" })).output;
    expect(out).toBe("<div>1</div><div>2</div><p>Hi <b>there</b></p>");
  });

  it("keeps whitespace as written when asked", async () => {
    expect((await minify("<div>1</div>\n  <div>2</div>", { whitespace: "keep" })).output).toBe("<div>1</div>\n  <div>2</div>");
  });

  it("keeps <pre> and <textarea> exactly", async () => {
    const src = "<pre>  a\n    b  </pre>\n<textarea>  x\n y</textarea>";
    const out = (await minify(src, { whitespace: "aggressive" })).output;
    expect(out).toContain("<pre>  a\n    b  </pre>");
    expect(out).toContain("<textarea>  x\n y</textarea>");
  });

  it("minifies inline CSS and JS, or leaves them alone", async () => {
    const src = "<style>p { color : red; }</style><script>function add ( a, b ) { return a + b }</script>";
    expect((await minify(src)).output).toBe("<style>p{color:red}</style><script>function add(n,d){return n+d}</script>");
    expect((await minify(src, { minifyCss: false, minifyJs: false })).output).toBe(src);
  });

  it("keeps inline JS it can't parse, and says so", async () => {
    const result = await minify("<script>function (</script>");
    expect(result.output).toBe("<script>function (</script>");
    expect(result.notices).toEqual([expect.stringMatching(/script.*kept as written/i)]);
  });

  it("never fetches a stylesheet an @import points at", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, "send");
    const out = (await minify("<style>@import url(https://example.com/x.css);\np { color: red }</style>")).output;
    expect(out).toContain("@import url(https://example.com/x.css)");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("keeps self-closing SVG elements closed", async () => {
    const out = (await minify('<svg viewBox="0 0 1 1"><path d="M0 0"/><circle r="1"/></svg><br/>')).output;
    expect(out).toContain('<path d="M0 0"/>');
    expect(out).toContain('<circle r="1"/>');
  });

  it("shortens boolean attributes and drops default type attributes", async () => {
    expect((await minify('<input disabled="disabled"><script type="text/javascript">a()</script>')).output).toBe("<input disabled><script>a()</script>");
  });

  it("keeps optional closing tags and quotes unless asked", async () => {
    const src = '<ul><li class="a">1</li><li>2</li></ul>';
    expect((await minify(src)).output).toBe(src);
    expect((await minify(src, { removeOptional: true })).output).toBe("<ul><li class=a>1<li>2</ul>");
  });

  it("keeps template tags as written", async () => {
    expect((await minify("<p>\n  <%= name %>\n</p>")).output).toBe("<p> <%= name %> </p>");
  });

  it("reports HTML it can't parse with a position", async () => {
    expect(await minifyHtml("<p>ok</p>\n<a href='x>y</a>", DEFAULT_MINIFY)).toMatchObject({ ok: false, error: { line: 2, column: 1 } });
  });
});

describe("gzipSize", () => {
  it("measures the gzipped size in bytes", async () => {
    const size = await gzipSize("a".repeat(10_000));
    expect(size).toBeGreaterThan(20);
    expect(size).toBeLessThan(100);
  });
});

describe("processHtml", () => {
  afterEach(() => vi.restoreAllMocks());

  it("formats or minifies, and measures both sides", async () => {
    const text = "<div>\n    <p>Hello   world</p>\n</div>\n";
    const result = await processHtml({ text, mode: "minify", format: DEFAULT_FORMAT, minify: { ...DEFAULT_MINIFY, whitespace: "aggressive" } });
    expect(result).toMatchObject({ ok: true, output: "<div><p>Hello world</p></div>" });
    if (result.ok) {
      expect(result.sizes).toEqual({ input: 38, output: 29, inputGzip: expect.any(Number), outputGzip: expect.any(Number) });
    }
    expect(await processHtml({ text, mode: "format", format: DEFAULT_FORMAT, minify: DEFAULT_MINIFY })).toMatchObject({ ok: true, output: "<div>\n  <p>Hello world</p>\n</div>\n" });
  });
});
