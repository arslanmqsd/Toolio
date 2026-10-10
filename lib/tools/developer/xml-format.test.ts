import { describe, expect, it } from "vitest";
import { DEFAULT_XML_OPTIONS, decodeXmlBytes, formatXml, minifyXml, parseXml, processXml, type XmlOptions } from "./xml-format";

const format = (text: string, options: Partial<XmlOptions> = {}) => {
  const r = formatXml(text, { ...DEFAULT_XML_OPTIONS, ...options });
  if (!r.ok) throw new Error(`${r.error.message} (${r.error.line}:${r.error.column})`);
  return r.output;
};

const minify = (text: string, options: Partial<XmlOptions> = {}) => {
  const r = minifyXml(text, { ...DEFAULT_XML_OPTIONS, ...options });
  if (!r.ok) throw new Error(r.error.message);
  return r.output;
};

const error = (text: string) => {
  const r = parseXml(text);
  if (r.ok) throw new Error("expected an error");
  return r.error;
};

describe("formatXml", () => {
  it("indents nested elements and keeps text on one line with its tags", () => {
    expect(format('<catalog><book id="1"><title>XML</title><price>9.99</price></book></catalog>')).toBe(
      `<catalog>
  <book id="1">
    <title>XML</title>
    <price>9.99</price>
  </book>
</catalog>
`,
    );
  });

  it("replaces the indentation that was there", () => {
    expect(format("<a>\n        <b/>\n\t<c/>\n</a>")).toBe("<a>\n  <b/>\n  <c/>\n</a>\n");
  });

  it("uses the indent asked for", () => {
    expect(format("<a><b/></a>", { indent: "4" })).toBe("<a>\n    <b/>\n</a>\n");
    expect(format("<a><b/></a>", { indent: "tab" })).toBe("<a>\n\t<b/>\n</a>\n");
  });

  it("keeps the prolog and what follows the root, each on its own line", () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE note [<!ENTITY who "Ada">]><!-- hi --><?xml-stylesheet href="s.xsl"?><note>&who;</note><!-- end -->';
    expect(format(xml)).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE note [<!ENTITY who "Ada">]>
<!-- hi -->
<?xml-stylesheet href="s.xsl"?>
<note>&who;</note>
<!-- end -->
`,
    );
  });

  it("never touches text: mixed content and text-only elements are kept as written", () => {
    expect(format("<doc><p>Hello <b>big</b>   <i>world</i>!</p></doc>")).toBe("<doc>\n  <p>Hello <b>big</b>   <i>world</i>!</p>\n</doc>\n");
    expect(format("<a><b>\n  spaced  \n</b></a>")).toBe("<a>\n  <b>\n  spaced  \n</b>\n</a>\n");
    // Only whitespace is still the element's text.
    expect(format("<a><sep> </sep></a>")).toBe("<a>\n  <sep> </sep>\n</a>\n");
  });

  it("keeps CDATA, entities and character references exactly", () => {
    expect(format("<a><s><![CDATA[x < y && <b>]]></s><t>&lt;&#169;&#x1F600;</t></a>")).toBe(
      "<a>\n  <s><![CDATA[x < y && <b>]]></s>\n  <t>&lt;&#169;&#x1F600;</t>\n</a>\n",
    );
  });

  it("keeps everything under xml:space=\"preserve\" as written", () => {
    expect(format('<a><code xml:space="preserve">\n  <x/>\n    <y/>\n</code><b><c/></b></a>')).toBe(
      '<a>\n  <code xml:space="preserve">\n  <x/>\n    <y/>\n</code>\n  <b>\n    <c/>\n  </b>\n</a>\n',
    );
  });

  it("puts comments and processing instructions between elements on their own lines", () => {
    expect(format("<a><!-- one --><b/><?pi data?></a>")).toBe("<a>\n  <!-- one -->\n  <b/>\n  <?pi data?>\n</a>\n");
  });

  it("keeps empty elements the way they were written", () => {
    expect(format("<a><b></b><c/></a>")).toBe("<a>\n  <b></b>\n  <c/>\n</a>\n");
  });

  it("tidies the space inside tags and uses double quotes when it can", () => {
    expect(format("<a   x = 'one'\n   y=\"it's\"  z='say \"hi\"' />")).toBe(`<a x="one" y="it's" z='say "hi"'/>\n`);
    expect(format("<a></a   >")).toBe("<a></a>\n");
  });

  it("can put each attribute on its own line", () => {
    expect(format('<a><b x="1" y="2">t</b><c z="3"/></a>', { attributesPerLine: true })).toBe('<a>\n  <b\n    x="1"\n    y="2">t</b>\n  <c z="3"/>\n</a>\n');
  });

  it("can sort attributes, keeping namespace declarations first", () => {
    expect(format('<a z="1" xmlns:b="urn:b" b:k="2" xmlns="urn:a" m="3"/>', { sortAttributes: true })).toBe(
      '<a xmlns="urn:a" xmlns:b="urn:b" b:k="2" m="3" z="1"/>\n',
    );
  });

  it("reads Windows line endings", () => {
    expect(format("<a>\r\n  <b/>\r\n</a>\r\n")).toBe("<a>\n  <b/>\n</a>\n");
  });

  it("drops a byte order mark", () => {
    expect(format("﻿<a/>")).toBe("<a/>\n");
  });

  it("handles deep nesting", () => {
    const deep = "<a>".repeat(3000) + "</a>".repeat(3000);
    const r = formatXml(deep, DEFAULT_XML_OPTIONS);
    expect(r.ok).toBe(true);
  });
});

describe("minifyXml", () => {
  it("removes whitespace between tags, never inside text", () => {
    expect(minify('<?xml version="1.0"?>\n<a>\n  <b x = "1" >text  here</b>\n  <c></c>\n</a>\n')).toBe('<?xml version="1.0"?><a><b x="1">text  here</b><c/></a>');
  });

  it("keeps mixed content and xml:space=\"preserve\" as written", () => {
    expect(minify("<a>\n  <p>Hi <b>there</b> <i>you</i></p>\n</a>")).toBe("<a><p>Hi <b>there</b> <i>you</i></p></a>");
    expect(minify('<a>\n <pre xml:space="preserve">\n  <b/>\n </pre>\n</a>')).toBe('<a><pre xml:space="preserve">\n  <b/>\n </pre></a>');
    expect(minify("<a><sep> </sep></a>")).toBe("<a><sep> </sep></a>");
  });

  it("removes comments when asked, even inside text", () => {
    expect(minify("<!-- top --><a><!-- x --><b>one<!-- y -->two</b></a>", { removeComments: true })).toBe("<a><b>onetwo</b></a>");
    expect(minify("<!-- top --><a><!-- x --><b/></a>", { removeComments: false })).toBe("<!-- top --><a><!-- x --><b/></a>");
  });

  it("keeps processing instructions, CDATA and the DOCTYPE", () => {
    expect(minify('<!DOCTYPE a [\n  <!ENTITY e "x">\n]>\n<?pi x?>\n<a><![CDATA[ <> ]]></a>')).toBe('<!DOCTYPE a [\n  <!ENTITY e "x">\n]><?pi x?><a><![CDATA[ <> ]]></a>');
  });
});

describe("parseXml", () => {
  it("counts what's there", () => {
    const r = parseXml('<a x="1"><b y="2" z="3"><c/></b><b/></a>');
    expect(r.ok && r.stats).toEqual({ root: "a", elements: 4, attributes: 3, depth: 3 });
  });

  it.each([
    ["", 1, 1, /empty/i],
    ["   ", 1, 4, /no root element/i],
    ["hello", 1, 1, /text.*outside the root/i],
    ["<a></b>", 1, 4, /<\/b>.*doesn't match <a>/],
    ["<a>\n<b>\n</a>", 3, 1, /<\/a>.*doesn't match <b>.*line 2/],
    ["<a>", 1, 1, /<a>.*never closed/],
    ["<a/><b/>", 1, 5, /only one root/i],
    ["<a/>text", 1, 5, /text.*after the root/i],
    ['<a x="1" x="2"/>', 1, 10, /x.*twice/],
    ["<a x=1/>", 1, 6, /quotes/i],
    ['<a x="1"y="2"/>', 1, 9, /space between attributes/i],
    ['<a x="<"/>', 1, 7, /&lt;/],
    ["<a>Tom & Jerry</a>", 1, 8, /&amp;/],
    ["<a>&nbsp;</a>", 1, 4, /&#160;/],
    ["<a>&copy;</a>", 1, 4, /isn't defined/],
    ["<a>&#0;</a>", 1, 4, /character/i],
    ["<a>]]></a>", 1, 4, /\]\]>/],
    ["<a><!-- a -- b --></a>", 1, 11, /--/],
    ["<a><![CDATA[x</a>", 1, 4, /CDATA.*never closed/i],
    ["<a><!-- x</a>", 1, 4, /comment.*never closed/i],
    ["<1a/>", 1, 2, /name/i],
    ['\n<?xml version="1.0"?><a/>', 2, 1, /very start/i],
    ['<a><?xml version="1.0"?></a>', 1, 4, /very start/i],
    ["<x:a/>", 1, 2, /prefix x.*declared/i],
    ['<a xmlns:x="urn:x"><x:b/></a><!-- -->', null, null, null],
    ['<a x:y="1"/>', 1, 4, /prefix x.*declared/i],
    ["<a>\u0001</a>", 1, 4, /U\+0001/],
    ["<a/><!DOCTYPE a>", 1, 5, /DOCTYPE.*before the root/i],
    ["<a></a  b>", 1, 9, /expected >/i],
  ])("%j", (text, line, column, message) => {
    if (message === null) {
      expect(parseXml(text).ok).toBe(true);
      return;
    }
    const e = error(text);
    expect(e.message).toMatch(message);
    expect([e.line, e.column]).toEqual([line, column]);
  });

  it("points an unclosed element at where it opened", () => {
    const e = error("<root>\n  <item>\n    <name>x</name>\n");
    expect(e.message).toMatch(/<item> on line 2 is never closed/);
    expect([e.line, e.column]).toEqual([2, 3]);
  });

  it("allows the entities a DOCTYPE declares, and can't check ones from an external DTD", () => {
    expect(parseXml('<!DOCTYPE a [<!ENTITY e "x">]><a>&e;</a>').ok).toBe(true);
    const external = parseXml('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><html>&nbsp;</html>');
    expect(external.ok).toBe(true);
    expect(external.ok && external.notices.join()).toMatch(/&nbsp;.*external DTD.*not loaded/i);
  });

  it("never expands entities, so nested ones can't blow up", () => {
    const lol = `<!DOCTYPE l [<!ENTITY a "aaaaaaaaaa">${Array.from({ length: 9 }, (_, i) => `<!ENTITY ${"b".repeat(i + 1)} "${`&${i === 0 ? "a" : "b".repeat(i)};`.repeat(10)}">`).join("")}]><l>&bbbbbbbbb;</l>`;
    const r = formatXml(lol, DEFAULT_XML_OPTIONS);
    expect(r.ok && r.output.length).toBeLessThan(lol.length + 10);
  });

  it("warns that a non-UTF-8 declaration doesn't match a UTF-8 download", () => {
    const r = parseXml('<?xml version="1.0" encoding="ISO-8859-1"?><a>café</a>');
    expect(r.ok && r.notices.join()).toMatch(/ISO-8859-1/);
    const ascii = parseXml('<?xml version="1.0" encoding="ISO-8859-1"?><a>cafe</a>');
    expect(ascii.ok && ascii.notices).toEqual([]);
  });

  it("accepts the xml prefix and names from other scripts", () => {
    expect(parseXml('<a xml:lang="en"><名前>x</名前><é.b-c_1/></a>').ok).toBe(true);
  });
});

describe("decodeXmlBytes", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it("reads UTF-8, with or without a byte order mark", () => {
    expect(decodeXmlBytes(new TextEncoder().encode("<a>é</a>"))).toBe("<a>é</a>");
    expect(decodeXmlBytes(bytes(0xef, 0xbb, 0xbf, ...ascii("<a/>")))).toBe("<a/>");
  });

  it("reads UTF-16 by its byte order mark", () => {
    expect(decodeXmlBytes(bytes(0xff, 0xfe, 0x3c, 0, 0x61, 0, 0x2f, 0, 0x3e, 0))).toBe("<a/>");
    expect(decodeXmlBytes(bytes(0xfe, 0xff, 0, 0x3c, 0, 0x61, 0, 0x2f, 0, 0x3e))).toBe("<a/>");
  });

  it("reads the encoding the declaration names", () => {
    expect(decodeXmlBytes(bytes(...ascii("<?xml version='1.0' encoding='ISO-8859-1'?><a>"), 0xe9, ...ascii("</a>")))).toBe(
      "<?xml version='1.0' encoding='ISO-8859-1'?><a>é</a>",
    );
  });

  it("falls back to UTF-8 for an encoding the browser doesn't know", () => {
    expect(decodeXmlBytes(new TextEncoder().encode('<?xml version="1.0" encoding="x-made-up"?><a/>'))).toBe('<?xml version="1.0" encoding="x-made-up"?><a/>');
  });
});

describe("processXml", () => {
  it("formats or minifies, and measures both sides", async () => {
    const result = await processXml({ text: "<a>\n  <b/>\n</a>", mode: "minify", options: DEFAULT_XML_OPTIONS });
    expect(result).toMatchObject({ ok: true, mode: "minify", output: "<a><b/></a>", sizes: { input: 15, output: 11 } });
  });

  it("passes errors through with the mode", async () => {
    expect(await processXml({ text: "<a>", mode: "format", options: DEFAULT_XML_OPTIONS })).toMatchObject({ ok: false, mode: "format" });
  });
});

describe("external entities", () => {
  it("are kept as written and pointed out, never loaded", () => {
    const xxe = '<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd"><!ENTITY % p PUBLIC "-//X//EN" "http://x.test/p.dtd">]><r>&xxe;</r>';
    const r = formatXml(xxe, DEFAULT_XML_OPTIONS);
    expect(r.ok && r.output).toContain("<r>&xxe;</r>");
    expect(r.ok && r.notices.join()).toMatch(/&xxe;, %p; point to other files or URLs\. They're never loaded/);
  });
});
