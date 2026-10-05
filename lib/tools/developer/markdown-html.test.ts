// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToHtml, previewDocument, sanitizeHtml, textStats, type ConvertResult } from "./markdown-html";

const output = (result: ConvertResult) => {
  if (!result.ok) throw new Error(result.error);
  return result.output;
};

describe("markdownToHtml", () => {
  it("converts GitHub Flavored Markdown", () => {
    const html = output(markdownToHtml("# Hi\n\n- [x] done\n\n| a |\n|---|\n| 1 |\n\n~~gone~~ https://x.com"));
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain('<input checked="" disabled="" type="checkbox"> done');
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain('<a href="https://x.com">https://x.com</a>');
  });

  it("keeps the code block's language for syntax highlighters", () => {
    expect(output(markdownToHtml("```ts\nlet x = 1;\n```"))).toBe('<pre><code class="language-ts">let x = 1;\n</code></pre>\n');
  });

  it("passes raw HTML through untouched, since only the preview is sanitized", () => {
    expect(output(markdownToHtml("<script>alert(1)</script>"))).toBe("<script>alert(1)</script>");
  });
});

describe("htmlToMarkdown", () => {
  it("round-trips GitHub Flavored Markdown", () => {
    const markdown = [
      "# Hi",
      "- a\n  - b\n- [x] done\n- [ ] todo",
      "1. one\n2. two",
      "```js\nlet x = 1;\n```",
      "~~gone~~ *em* **b** <https://x.com> [docs](https://x.com/docs)",
      "> quote",
      "---",
    ].join("\n\n");
    const result = htmlToMarkdown(output(markdownToHtml(markdown)));
    expect(result).toEqual({ ok: true, output: markdown, lossy: { keptAsHtml: [], removed: [] } });
  });

  it("converts tables", () => {
    expect(output(htmlToMarkdown("<table><tr><th>a</th></tr><tr><td>1</td></tr></table>"))).toMatch(/^\| a +\|\n\| -+ \|\n\| 1 +\|$/);
  });

  it("converts only the body of a full document", () => {
    const html = "<!doctype html><html><head><title>Secret title</title><style>p{}</style></head><body><p>Hello</p></body></html>";
    expect(htmlToMarkdown(html)).toEqual({ ok: true, output: "Hello", lossy: { keptAsHtml: [], removed: [] } });
  });

  it("keeps what Markdown can't express as raw HTML, drops code, and reports both", () => {
    const html = '<p style="color:red" onclick="x()">Hi <u>there</u> and <canvas></canvas> too</p><svg><circle r="1"></circle></svg><my-widget>w</my-widget><script>alert(1)</script>';
    const result = htmlToMarkdown(html);
    expect(output(result)).toBe('Hi <u>there</u> and <canvas></canvas> too\n\n<svg><circle r="1"></circle></svg><my-widget>w</my-widget>');
    expect(result.ok && result.lossy).toEqual({
      keptAsHtml: ["<u>", "<canvas>", "<svg>", "<my-widget>"],
      removed: ["style attributes", "event handler attributes", "<script>"],
    });
  });

  it("keeps preformatted text without <code> as a code block", () => {
    expect(output(htmlToMarkdown("<pre>a  b\n  c</pre>"))).toBe("```\na  b\n  c\n```");
  });

  it("accepts sloppy HTML", () => {
    expect(output(htmlToMarkdown("<p>one<p><b>two"))).toBe("one\n\n**two**");
  });
});

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

describe("previewDocument", () => {
  it("adds a CSP that blocks scripts and opens links outside the frame", () => {
    const doc = previewDocument("<p>x</p>", "body{}");
    expect(doc).toContain("default-src 'none'; img-src * data:; style-src 'unsafe-inline'");
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain("<body><p>x</p></body>");
  });
});

describe("textStats", () => {
  it("counts UTF-8 bytes, words and lines", () => {
    expect(textStats("# Héllo\nworld  two\n")).toEqual({ bytes: 20, words: 4, lines: 3 });
    expect(textStats("")).toEqual({ bytes: 0, words: 0, lines: 0 });
  });
});
