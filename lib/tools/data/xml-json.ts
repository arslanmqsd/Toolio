/**
 * XML ↔ JSON. XML is read with the XML Formatter's parser, so nothing is ever fetched and only
 * the five built-in entities and character references are decoded: a custom entity stays as
 * written, which keeps XXE and "billion laughs" input plain text. JSON is read with the JSON
 * Formatter's parser and written from its tree, so numbers keep their digits both ways.
 *
 * There's no one standard mapping. This one: the root element is the top key, attributes get a
 * prefix (@id), text beside attributes or elements is #text, and repeated elements are arrays.
 */
import { plural, some, type Notice } from "@/lib/notices";
import { parseJson, printJson, type JsonNode } from "@/lib/tools/developer/json-format";
import { FORBIDDEN_CHAR, NC_NAME, NC_NAME_START_CHAR, NOT_NC_NAME_CHAR, parseXml, type Element } from "@/lib/tools/developer/xml-format";
import { inferScalar, stringNode } from "./infer-scalar";

export type { Notice };

export type AttributePrefix = "@" | "_" | "$" | "";

export const TEXT_KEY = "#text";

export interface XmlJsonError {
  message: string;
  line: number;
  column: number;
}

/** About the XML side: read or written. */
export interface XmlJsonStats {
  elements: number;
  attributes: number;
  depth: number;
}

export type XmlJsonResult = { ok: true; output: string; notices: Notice[]; stats: XmlJsonStats } | { ok: false; error: XmlJsonError };

const tooDeep = (depth: number): XmlJsonResult => ({
  ok: false,
  error: { message: `This is valid, but nested too deeply (${depth.toLocaleString("en-US")} levels) to convert here.`, line: 1, column: 1 },
});

// ---------------------------------------------------------------------------
// XML → JSON
// ---------------------------------------------------------------------------

export interface XmlToJsonOptions {
  attributePrefix: AttributePrefix;
  /** Every element becomes an array, even one that appears once, so the shape doesn't depend on the data. */
  alwaysArrays: boolean;
  /** Numbers, true/false and null become JSON values; everything else stays a string. */
  inferTypes: boolean;
  /** Drop prefixes (dc:title → title) and the xmlns attributes that declare them. */
  stripNamespaces: boolean;
  /** Trim whitespace around text, except under xml:space="preserve". */
  trimText: boolean;
  /** "" for one line. */
  indent: string;
}

export const DEFAULT_XML_TO_JSON: XmlToJsonOptions = { attributePrefix: "@", alwaysArrays: false, inferTypes: false, stripNamespaces: false, trimText: true, indent: "  " };

const PREDEFINED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Decodes the built-in entities and character references; any other entity stays as written. */
function decode(raw: string, customEntities: Set<string>): string {
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[^;&\s]+);/g, (ref, body: string) => {
    if (body[0] === "#") return String.fromCodePoint(body[1] === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1)));
    if (body in PREDEFINED) return PREDEFINED[body];
    customEntities.add(ref);
    return ref;
  });
}

const XML_WHITESPACE = /^[ \t\n]*$/;
const localName = (name: string) => name.slice(name.indexOf(":") + 1);

export function xmlToJson(text: string, options: XmlToJsonOptions): XmlJsonResult {
  const parsed = parseXml(text);
  if (!parsed.ok) return parsed;
  const { document, stats } = parsed;
  const prefix = options.attributePrefix;

  const customEntities = new Set<string>();
  const bigNumbers: string[] = [];
  const mixed = new Set<string>();
  const clashes = new Set<string>();
  // Where an element name has appeared once and where many times, by parent: "items>item".
  const single = new Set<string>();
  const many = new Set<string>();
  const dropped = { comments: 0, pis: 0 };

  const scalar = (value: string): JsonNode => (options.inferTypes ? inferScalar(value, bigNumbers) : stringNode(value));
  const nameOf = (name: string) => (options.stripNamespaces ? localName(name) : name);

  function convert(element: Element): JsonNode {
    const attributes: [string, JsonNode][] = [];
    for (const { name, value } of element.attributes) {
      if (options.stripNamespaces && (name === "xmlns" || name.startsWith("xmlns:"))) continue;
      // XML parsers read a literal tab or line break in an attribute value as a space.
      attributes.push([prefix + nameOf(name), scalar(decode(value.replace(/[\t\n]/g, " "), customEntities))]);
    }

    const children = new Map<string, JsonNode[]>();
    const texts: string[] = [];
    let cdata = false;
    for (const child of element.children) {
      if (child.type === "element") {
        const name = nameOf(child.name);
        const list = children.get(name);
        if (list) list.push(convert(child));
        else children.set(name, [convert(child)]);
      } else if (child.type === "text") texts.push(decode(child.raw, customEntities));
      else if (child.type === "cdata") {
        texts.push(child.raw.slice("<![CDATA[".length, -"]]>".length));
        cdata = true;
      } else if (child.type === "comment") dropped.comments++;
      else if (child.type === "pi") dropped.pis++;
    }

    const hasText = cdata || texts.some((t) => !XML_WHITESPACE.test(t));
    let textValue: string | undefined;
    if (element.preserve) textValue = texts.length > 0 ? texts.join("") : undefined;
    // In mixed content the trimmed pieces are joined with a space, since where they sat is lost anyway.
    else if (hasText) textValue = options.trimText ? texts.map((t) => t.trim()).filter((t) => t !== "").join(" ") : texts.join("");
    if (hasText && children.size > 0) mixed.add(nameOf(element.name));

    if (attributes.length === 0 && children.size === 0) return scalar(textValue ?? "");

    const where = nameOf(element.name);
    for (const [name, list] of children) (list.length > 1 ? many : single).add(`${where}>${name}`);

    const entries: { key: string; value: JsonNode }[] = attributes.map(([key, value]) => ({ key, value }));
    if (textValue !== undefined && (children.size > 0 || attributes.length > 0)) entries.push({ key: TEXT_KEY, value: scalar(textValue) });
    for (const [name, list] of children) {
      const value: JsonNode = list.length > 1 || options.alwaysArrays ? { type: "array", items: list } : list[0];
      const attribute = entries.findIndex((e) => e.key === name);
      if (attribute >= 0) {
        // Only when attributes have no prefix: keep both rather than lose one.
        clashes.add(name);
        entries[attribute] = { key: name, value: { type: "array", items: [entries[attribute].value, ...(value.type === "array" ? value.items : [value])] } };
      } else entries.push({ key: name, value });
    }
    return { type: "object", entries: entries.map(({ key, value }) => ({ key, rawKey: JSON.stringify(key), value })) };
  }

  let output: string;
  try {
    const rootName = nameOf(document.root.name);
    const root = convert(document.root);
    const top: JsonNode = { type: "object", entries: [{ key: rootName, rawKey: JSON.stringify(rootName), value: root }] };
    output = printJson(top, { indent: options.indent, sortKeys: false });
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    return tooDeep(stats.depth);
  }

  const notices: Notice[] = [];
  // Entity notices still apply; the encoding one is about writing XML, and the output here is JSON.
  for (const message of parsed.notices) if (!message.startsWith("The declaration says encoding")) notices.push({ kind: "warning", message });
  // The parser already names entities from other files; these are the rest.
  const unexpanded = [...customEntities].filter((ref) => !parsed.notices.some((m) => m.includes(ref)));
  if (unexpanded.length > 0) {
    const one = unexpanded.length === 1;
    notices.push({ kind: "warning", message: `${some(unexpanded)} ${one ? "is a custom entity" : "are custom entities"}, not expanded, so ${one ? "it's" : "they're"} kept as written.` });
  }
  const shifting = [...many].filter((path) => single.has(path));
  if (shifting.length > 0 && !options.alwaysArrays) {
    const names = [...new Set(shifting.map((path) => `<${path.slice(path.indexOf(">") + 1)}>`))];
    notices.push({
      kind: "warning",
      message: `${some(names)} ${names.length === 1 ? "is a list in some places and a single value in others" : "are lists in some places and single values in others"}, so code reading the JSON has to handle both. Turn on "Always use arrays" to make every element a list.`,
    });
  }
  if (mixed.size > 0) {
    const names = [...mixed].map((n) => `<${n}>`);
    notices.push({ kind: "warning", message: `${some(names)} ${mixed.size === 1 ? "mixes" : "mix"} text and elements. The text is joined into ${TEXT_KEY}, and where it sat among the elements is lost.` });
  }
  if (clashes.size > 0) notices.push({ kind: "warning", message: `${some([...clashes])} ${clashes.size === 1 ? "is" : "are"} both an attribute and an element, so the values are kept together in an array.` });
  if (bigNumbers.length > 0) {
    const one = bigNumbers.length === 1;
    notices.push({ kind: "info", message: `${some(bigNumbers)} ${one ? "is" : "are"} too large for JavaScript to read exactly, so ${one ? "it's kept as a string" : "they're kept as strings"}.` });
  }
  dropped.comments += [...document.prolog, ...document.epilog].filter((m) => m.type === "comment").length;
  dropped.pis += [...document.prolog, ...document.epilog].filter((m) => m.type === "pi").length;
  const droppedParts = [
    dropped.comments > 0 && plural(dropped.comments, "comment", "comments"),
    dropped.pis > 0 && plural(dropped.pis, "processing instruction", "processing instructions"),
    document.prolog.some((m) => m.type === "doctype") && "the DOCTYPE",
  ].filter((part): part is string => typeof part === "string");
  const droppedCount = dropped.comments + dropped.pis + (droppedParts.includes("the DOCTYPE") ? 1 : 0);
  if (droppedParts.length > 0) notices.push({ kind: "info", message: `Left out ${some(droppedParts)}, since JSON has no place for ${droppedCount === 1 ? "it" : "them"}.` });

  return { ok: true, output, notices, stats: { elements: stats.elements, attributes: stats.attributes, depth: stats.depth } };
}

// ---------------------------------------------------------------------------
// JSON → XML
// ---------------------------------------------------------------------------

export interface JsonToXmlOptions {
  attributePrefix: AttributePrefix;
  /** The root element when the JSON isn't one object with a single key. */
  rootName: string;
  /** Start with <?xml version="1.0" encoding="UTF-8"?>. */
  declaration: boolean;
  /** "" for one line. */
  indent: string;
}

export const DEFAULT_JSON_TO_XML: JsonToXmlOptions = { attributePrefix: "@", rootName: "root", declaration: true, indent: "  " };

/** The element name for each item of an array inside an array, and of a top-level array. */
const ITEM = "item";

export function jsonToXml(text: string, options: JsonToXmlOptions): XmlJsonResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, error: { message: parsed.error.message, line: parsed.error.line, column: parsed.error.column } };
  const prefix = options.attributePrefix;
  const pretty = options.indent !== "";
  const newline = pretty ? "\n" : "";
  const notices: Notice[] = [];
  const renamed = new Map<string, string>();
  const notAttributes = new Set<string>();
  const stats: XmlJsonStats = { elements: 0, attributes: 0, depth: 0 };
  let replaced = 0;

  if (parsed.stats.duplicateKeys.length > 0) {
    notices.push({ kind: "warning", message: `Duplicate keys (${some([...new Set(parsed.stats.duplicateKeys)])}): each one is written as its own element.` });
  }

  const clean = (value: string) =>
    value.replace(new RegExp(FORBIDDEN_CHAR.source, "g"), () => {
      replaced++;
      return "�";
    });
  const escapeText = (value: string) => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;");
  const escapeAttribute = (value: string) =>
    clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");
  const scalarText = (node: JsonNode) => (node.type === "string" ? (JSON.parse(node.raw) as string) : node.type === "null" ? "" : node.type === "object" || node.type === "array" ? "" : node.raw);

  /** A valid name for the key: a declared prefix is kept, anything else that can't be in a name becomes _. */
  function nameFor(key: string, scope: Set<string>, attribute: boolean): string {
    const colon = key.indexOf(":");
    if (colon > 0 && NC_NAME.test(key.slice(0, colon)) && NC_NAME.test(key.slice(colon + 1))) {
      const ns = key.slice(0, colon);
      if (ns === "xml" || scope.has(ns) || (attribute && ns === "xmlns")) return key;
    } else if (NC_NAME.test(key)) return key;
    let name = key.replace(NOT_NC_NAME_CHAR, "_");
    if (!NC_NAME_START_CHAR.test(name)) name = `_${name}`;
    renamed.set(key, name);
    return name;
  }

  function element(name: string, node: JsonNode, depth: number, scope: Set<string>, inline: boolean, out: string[]): void {
    stats.elements++;
    stats.depth = Math.max(stats.depth, depth + 1);
    const pad = inline ? "" : options.indent.repeat(depth);
    const end = inline ? "" : newline;

    if (node.type === "array") {
      // An array as an item of an array: <item> elements inside this one.
      const open = `${pad}<${name}>`;
      if (node.items.length === 0) out.push(`${pad}<${name}/>${end}`);
      else {
        out.push(open + end);
        for (const item of node.items) element(ITEM, item, depth + 1, scope, inline, out);
        out.push(`${pad}</${name}>${end}`);
      }
      return;
    }
    if (node.type !== "object") {
      out.push(node.type === "null" ? `${pad}<${name}/>${end}` : `${pad}<${name}>${escapeText(scalarText(node))}</${name}>${end}`);
      return;
    }

    // Namespace declarations first, so the names on this element can use them.
    let inner = scope;
    for (const { key } of node.entries) {
      if (prefix !== "" && key.startsWith(`${prefix}xmlns:`)) {
        if (inner === scope) inner = new Set(scope);
        inner.add(key.slice(prefix.length + "xmlns:".length));
      }
    }

    const attributes: string[] = [];
    const used = new Set<string>();
    const children: { key: string; value: JsonNode }[] = [];
    let textValue: string | undefined;
    for (const entry of node.entries) {
      if (entry.key === TEXT_KEY) {
        textValue = (textValue ?? "") + scalarText(entry.value);
        continue;
      }
      if (prefix !== "" && entry.key.startsWith(prefix) && entry.key.length > prefix.length) {
        const bare = entry.key.slice(prefix.length);
        if (entry.value.type === "object" || entry.value.type === "array") {
          notAttributes.add(entry.key);
          children.push({ key: bare, value: entry.value });
          continue;
        }
        let attribute = nameFor(bare, inner, true);
        // Two keys can end up with the same name, and an attribute can only appear once.
        for (let n = 2; used.has(attribute); n++) attribute = `${nameFor(bare, inner, true)}_${n}`;
        used.add(attribute);
        stats.attributes++;
        attributes.push(` ${attribute}="${escapeAttribute(scalarText(entry.value))}"`);
        continue;
      }
      children.push(entry);
    }

    const open = `<${name}${attributes.join("")}`;
    const items = children.flatMap(({ key, value }) => {
      const childName = nameFor(key, inner, false);
      return value.type === "array" ? value.items.map((item) => ({ name: childName, value: item })) : [{ name: childName, value }];
    });
    if (items.length === 0 && textValue === undefined) {
      out.push(`${pad}${open}/>${end}`);
      return;
    }
    if (items.length === 0) {
      out.push(`${pad}${open}>${escapeText(textValue!)}</${name}>${end}`);
      return;
    }
    // Text beside elements is written on one line, since added whitespace would become part of it.
    const mixed = inline || textValue !== undefined;
    out.push(`${pad}${open}>${mixed ? "" : newline}${textValue !== undefined ? escapeText(textValue) : ""}`);
    for (const item of items) element(item.name, item.value, depth + 1, inner, mixed, out);
    out.push(`${mixed ? "" : pad}</${name}>${end}`);
  }

  // A single top key that isn't an attribute or a list is the root element; anything else is wrapped.
  const root = parsed.value;
  const only = root.type === "object" && root.entries.length === 1 ? root.entries[0] : null;
  const isRoot = only !== null && only.value.type !== "array" && only.key !== TEXT_KEY && !(prefix !== "" && only.key.startsWith(prefix));
  const out: string[] = [];
  try {
    if (isRoot) element(nameFor(only.key, new Set(), false), only.value, 0, new Set(), false, out);
    else {
      const wrapper = nameFor(options.rootName.trim() || "root", new Set(), false);
      element(wrapper, root.type === "array" ? { type: "object", entries: [{ key: ITEM, rawKey: `"${ITEM}"`, value: root }] } : root, 0, new Set(), false, out);
    }
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    return tooDeep(parsed.stats.depth);
  }

  if (renamed.size > 0) {
    const shown = [...renamed].map(([from, to]) => `${from === "" ? '""' : from} → ${to}`);
    notices.push({ kind: "warning", message: `${some(shown)}: ${renamed.size === 1 ? "this key isn't a valid element or attribute name" : "these keys aren't valid element or attribute names"}, so ${renamed.size === 1 ? "it was" : "they were"} renamed.` });
  }
  if (notAttributes.size > 0) notices.push({ kind: "warning", message: `${some([...notAttributes])} ${notAttributes.size === 1 ? "holds" : "hold"} an object or array, which can't be an attribute, so ${notAttributes.size === 1 ? "it's" : "they're"} written as an element.` });
  if (replaced > 0) notices.push({ kind: "warning", message: `${plural(replaced, "character", "characters")} can't be in XML at all (control characters like \\u0000), so ${replaced === 1 ? "it was" : "they were"} replaced with �.` });

  const declaration = options.declaration ? `<?xml version="1.0" encoding="UTF-8"?>${newline}` : "";
  return { ok: true, output: declaration + out.join(""), notices, stats };
}

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

export type XmlJsonRequest = { text: string } & ({ direction: "xml-to-json"; options: XmlToJsonOptions } | { direction: "json-to-xml"; options: JsonToXmlOptions });

export type XmlJsonJobResult = { direction: XmlJsonRequest["direction"] } & XmlJsonResult;

export function convertXmlJson(request: XmlJsonRequest): XmlJsonJobResult {
  const result = request.direction === "xml-to-json" ? xmlToJson(request.text, request.options) : jsonToXml(request.text, request.options);
  return { ...result, direction: request.direction };
}
