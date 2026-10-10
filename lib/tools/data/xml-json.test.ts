import { describe, expect, it } from "vitest";
import { DEFAULT_JSON_TO_XML, DEFAULT_XML_TO_JSON, jsonToXml, xmlToJson, type JsonToXmlOptions, type XmlToJsonOptions } from "./xml-json";

const toJson = (xml: string, options: Partial<XmlToJsonOptions> = {}) => {
  const r = xmlToJson(xml, { ...DEFAULT_XML_TO_JSON, indent: "", ...options });
  if (!r.ok) throw new Error(r.error.message);
  return r;
};
const json = (xml: string, options: Partial<XmlToJsonOptions> = {}) => JSON.parse(toJson(xml, options).output);
const messages = (r: { notices: { message: string }[] }) => r.notices.map((n) => n.message).join(" | ");

const toXml = (text: string, options: Partial<JsonToXmlOptions> = {}) => {
  const r = jsonToXml(text, { ...DEFAULT_JSON_TO_XML, declaration: false, indent: "", ...options });
  if (!r.ok) throw new Error(r.error.message);
  return r;
};

describe("xmlToJson", () => {
  it("keys the result by the root element, with text-only elements as strings", () => {
    expect(toJson("<user><name>Ada</name><age>36</age></user>").output).toBe('{"user":{"name":"Ada","age":"36"}}');
  });

  it("indents as asked", () => {
    expect(toJson("<a><b>1</b></a>", { indent: "  " }).output).toBe('{\n  "a": {\n    "b": "1"\n  }\n}');
  });

  it("writes attributes with a prefix, and text beside them as #text", () => {
    expect(json('<price currency="USD" net="">44.95</price>')).toEqual({ price: { "@currency": "USD", "@net": "", "#text": "44.95" } });
    expect(json('<a id="1"/>', { attributePrefix: "_" })).toEqual({ a: { _id: "1" } });
    expect(json('<a id="1"/>', { attributePrefix: "" })).toEqual({ a: { id: "1" } });
  });

  it("makes repeated elements an array, and says when the same element is sometimes one and sometimes many", () => {
    const r = toJson("<orders><order><item>a</item><item>b</item></order><order><item>c</item></order></orders>");
    expect(JSON.parse(r.output)).toEqual({ orders: { order: [{ item: ["a", "b"] }, { item: "c" }] } });
    expect(messages(r)).toMatch(/<item>.*list in some places.*single value in others/);
  });

  it("can always use arrays, so the shape doesn't depend on the data", () => {
    expect(json('<r a="1"><x>1</x><y><z>2</z></y></r>', { alwaysArrays: true })).toEqual({ r: { "@a": "1", x: ["1"], y: [{ z: ["2"] }] } });
  });

  it("ignores the whitespace that only lays out elements", () => {
    const r = toJson('<a x="1">\n  <b>1</b>\n  <c>\n    <d>2</d>\n  </c>\n</a>\n');
    expect(JSON.parse(r.output)).toEqual({ a: { "@x": "1", b: "1", c: { d: "2" } } });
    expect(r.notices).toEqual([]);
  });

  it("writes empty elements as empty strings", () => {
    expect(json("<a><b/><c></c><d>  </d></a>")).toEqual({ a: { b: "", c: "", d: "" } });
  });

  it("decodes the built-in entities and character references", () => {
    expect(json('<a t="x &amp; &quot;y&quot;">&lt;b&gt; &#169; &#x1F600; &apos;</a>')).toEqual({ a: { "@t": 'x & "y"', "#text": "<b> © 😀 '" } });
  });

  it("never expands custom entities, keeping them as written", () => {
    const xml = '<!DOCTYPE a [<!ENTITY x "boom"><!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&x; &xxe;</a>';
    const r = toJson(xml);
    expect(JSON.parse(r.output)).toEqual({ a: "&x; &xxe;" });
    expect(messages(r)).toMatch(/xxe.*never loaded/);
    expect(messages(r)).toMatch(/&x; is a custom entity, not expanded/);
    expect(r.notices.filter((n) => n.message.includes("&xxe;"))).toHaveLength(1);
  });

  it("turns tabs and line breaks in attribute values into spaces, as XML parsers do", () => {
    expect(json('<a t="one\ntwo\tthree&#10;four"/>')).toEqual({ a: { "@t": "one two three\nfour" } });
  });

  it("trims text, unless asked not to or under xml:space=\"preserve\"", () => {
    expect(json("<a>\n  hi  \n</a>")).toEqual({ a: "hi" });
    expect(json("<a>\n  hi  \n</a>", { trimText: false })).toEqual({ a: "\n  hi  \n" });
    expect(json('<r><p xml:space="preserve">  hi  </p></r>')).toEqual({ r: { p: { "@xml:space": "preserve", "#text": "  hi  " } } });
  });

  it("reads CDATA as text, and says so", () => {
    const r = toJson("<s><![CDATA[a < b && c]]></s>");
    expect(JSON.parse(r.output)).toEqual({ s: "a < b && c" });
  });

  it("joins the text of mixed content and warns that its place among the elements is lost", () => {
    const r = toJson("<p>An <em>in-depth</em> look.</p>");
    expect(JSON.parse(r.output)).toEqual({ p: { "#text": "An look.", em: "in-depth" } });
    expect(messages(r)).toMatch(/<p>.*mixes text and elements/);
  });

  it("drops comments, processing instructions and the DOCTYPE, and says how many", () => {
    const r = toJson('<?xml version="1.0"?><!DOCTYPE a><!-- c --><a><?pi x?><!-- d --><b>1</b></a>');
    expect(JSON.parse(r.output)).toEqual({ a: { b: "1" } });
    expect(messages(r)).toMatch(/2 comments.*1 processing instruction.*DOCTYPE.*for them/);
    expect(messages(toJson("<!-- c --><a/>"))).toMatch(/1 comment, since JSON has no place for it\./);
  });

  it("keeps namespace prefixes, or drops them and the xmlns attributes when asked", () => {
    const xml = '<c xmlns="urn:x" xmlns:dc="urn:dc"><dc:title>T</dc:title><b dc:id="1"/></c>';
    expect(json(xml)).toEqual({ c: { "@xmlns": "urn:x", "@xmlns:dc": "urn:dc", "dc:title": "T", b: { "@dc:id": "1" } } });
    expect(json(xml, { stripNamespaces: true })).toEqual({ c: { title: "T", b: { "@id": "1" } } });
  });

  it("guesses numbers, booleans and null only when asked, keeping codes like 007 as text", () => {
    const xml = '<r n="1"><a>42</a><b>-3.5</b><c>true</c><d>007</d><e>null</e><f>9007199254740993</f></r>';
    expect(json(xml)).toEqual({ r: { "@n": "1", a: "42", b: "-3.5", c: "true", d: "007", e: "null", f: "9007199254740993" } });
    const r = toJson(xml, { inferTypes: true });
    expect(r.output).toBe('{"r":{"@n":1,"a":42,"b":-3.5,"c":true,"d":"007","e":null,"f":"9007199254740993"}}');
    expect(messages(r)).toMatch(/9007199254740993.*too large/);
  });

  it("merges an attribute and an element of the same name into an array, and warns", () => {
    const r = toJson('<a id="1"><id>2</id></a>', { attributePrefix: "" });
    expect(JSON.parse(r.output)).toEqual({ a: { id: ["1", "2"] } });
    expect(messages(r)).toMatch(/id.*both an attribute and an element/);
  });

  it("keeps __proto__ as a plain key", () => {
    expect(toJson("<a><__proto__>x</__proto__></a>").output).toBe('{"a":{"__proto__":"x"}}');
  });

  it("reports XML that isn't well-formed, with where", () => {
    const r = xmlToJson("<a>\n<b></a>", DEFAULT_XML_TO_JSON);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(/<\/a> doesn't match <b>/);
      expect(r.error.line).toBe(2);
    }
  });

  it("counts what it read", () => {
    expect(toJson('<a x="1"><b/><b/></a>').stats).toEqual({ elements: 3, attributes: 1, depth: 2 });
  });

  it("handles deep nesting without running out of stack", () => {
    const depth = 100_000;
    const r = xmlToJson("<a>".repeat(depth) + "</a>".repeat(depth), DEFAULT_XML_TO_JSON);
    expect(!r.ok && r.error.message).toMatch(/nested too deeply/);
  });
});

describe("jsonToXml", () => {
  it("uses a single top key as the root element", () => {
    expect(toXml('{"user":{"name":"Ada","age":36,"admin":true}}').output).toBe("<user><name>Ada</name><age>36</age><admin>true</admin></user>");
  });

  it("wraps anything else in the root element asked for", () => {
    expect(toXml('{"a":1,"b":2}').output).toBe("<root><a>1</a><b>2</b></root>");
    expect(toXml('{"a":1,"b":2}', { rootName: "data" }).output).toBe("<data><a>1</a><b>2</b></data>");
    expect(toXml('{"item":[1,2]}').output).toBe("<root><item>1</item><item>2</item></root>");
    expect(toXml("[1,2]").output).toBe("<root><item>1</item><item>2</item></root>");
    expect(toXml('"hi"').output).toBe("<root>hi</root>");
  });

  it("repeats an element for each item of an array, and nests arrays of arrays as <item>", () => {
    expect(toXml('{"r":{"tag":["a","b"],"grid":[[1,2],[3]]}}').output).toBe("<r><tag>a</tag><tag>b</tag><grid><item>1</item><item>2</item></grid><grid><item>3</item></grid></r>");
  });

  it("writes prefixed keys as attributes and #text as text", () => {
    expect(toXml('{"price":{"@currency":"USD","@n":5,"#text":44.95}}').output).toBe('<price currency="USD" n="5">44.95</price>');
    expect(toXml('{"a":{"_id":"1"}}', { attributePrefix: "_" }).output).toBe('<a id="1"/>');
  });

  it("writes null and empty objects as empty elements, and empty strings as open and close tags", () => {
    expect(toXml('{"r":{"a":null,"b":{},"c":"","d":[]}}').output).toBe("<r><a/><b/><c></c></r>");
  });

  it("escapes text and attribute values", () => {
    expect(toXml('{"a":{"@t":"x & \\"y\\" <z>\\n","#text":"<b> & ]]>"}}').output).toBe('<a t="x &amp; &quot;y&quot; &lt;z>&#10;">&lt;b&gt; &amp; ]]&gt;</a>');
  });

  it("renames keys that can't be element names, and says so", () => {
    const r = toXml('{"r":{"1st":1,"first name":2,"":3,"ok-name":4}}');
    expect(r.output).toBe("<r><_1st>1</_1st><first_name>2</first_name><_>3</_><ok-name>4</ok-name></r>");
    expect(messages(r)).toMatch(/1st → _1st.*first name → first_name/);
  });

  it("keeps namespace prefixes that are declared, and replaces the colon in ones that aren't", () => {
    expect(toXml('{"c":{"@xmlns:dc":"urn:dc","dc:title":"T"}}').output).toBe('<c xmlns:dc="urn:dc"><dc:title>T</dc:title></c>');
    const r = toXml('{"c":{"dc:title":"T"}}');
    expect(r.output).toBe("<c><dc_title>T</dc_title></c>");
    expect(messages(r)).toMatch(/dc:title → dc_title/);
  });

  it("writes an object or array under an attribute key as an element, and warns", () => {
    const r = toXml('{"a":{"@b":{"c":1}}}');
    expect(r.output).toBe("<a><b><c>1</c></b></a>");
    expect(messages(r)).toMatch(/@b.*can't be an attribute/);
  });

  it("replaces characters XML can't hold, and warns", () => {
    const r = toXml('{"a":"x\\u0000y"}');
    expect(r.output).toBe("<a>x�y</a>");
    expect(messages(r)).toMatch(/1 character.*can't be in XML/);
  });

  it("writes mixed text and elements on one line, so no whitespace is added to the text", () => {
    expect(toXml('{"p":{"#text":"Hi","b":{"c":"x"}}}', { indent: "  " }).output).toBe("<p>Hi<b><c>x</c></b></p>\n");
  });

  it("indents and adds a declaration", () => {
    expect(toXml('{"a":{"@x":"1","b":{"c":"1"},"d":null}}', { indent: "  ", declaration: true }).output).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<a x="1">\n  <b>\n    <c>1</c>\n  </b>\n  <d/>\n</a>\n',
    );
  });

  it("keeps numbers exactly as written", () => {
    expect(toXml('{"a":9007199254740993.10}').output).toBe("<a>9007199254740993.10</a>");
  });

  it("reports JSON it can't read, with where", () => {
    const r = jsonToXml('{"a":1,}', DEFAULT_JSON_TO_XML);
    expect(r.ok || r.error).toMatchObject({ line: 1 });
  });

  it("counts what it wrote", () => {
    expect(toXml('{"a":{"@x":1,"b":[1,2]}}').stats).toEqual({ elements: 3, attributes: 1, depth: 2 });
  });
});

describe("round trip", () => {
  it("gets the same XML back", () => {
    const xml = '<catalog xmlns:dc="urn:dc"><book id="1"><dc:title>A &amp; B</dc:title><tag>x</tag><tag>y</tag><empty/></book></catalog>';
    const back = toXml(toJson(xml).output).output;
    expect(back).toBe(xml.replace("<empty/>", "<empty></empty>"));
  });
});
