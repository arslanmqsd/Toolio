/**
 * Checks that XML is well-formed, and formats or minifies it. Written for this tool rather than
 * using the browser's parser, so errors read the same everywhere and nothing is ever loaded or
 * expanded: DTDs aren't fetched and entities stay as written, which makes XXE and "billion laughs"
 * input plain text. Only whitespace between tags is changed; text is never touched.
 */
import { measureSizeChange, type SizeChange } from "@/lib/gzip-size";

export interface XmlOptions {
  indent: "2" | "4" | "tab";
  /** Elements with 2 or more attributes get one attribute per line. */
  attributesPerLine: boolean;
  /** A to Z, with namespace declarations first. Attribute order means nothing in XML. */
  sortAttributes: boolean;
  /** Minify only. */
  removeComments: boolean;
}

export const DEFAULT_XML_OPTIONS: XmlOptions = { indent: "2", attributesPerLine: false, sortAttributes: false, removeComments: true };

export interface XmlError {
  message: string;
  line: number;
  column: number;
}

export interface XmlStats {
  root: string;
  elements: number;
  attributes: number;
  /** How many elements deep it goes; a lone root is 1. */
  depth: number;
}

export interface Attribute {
  name: string;
  /** As written, entities and all. */
  value: string;
}

export interface Element {
  type: "element";
  name: string;
  attributes: Attribute[];
  children: XmlNode[];
  selfClosing: boolean;
  /** Under xml:space="preserve", so whitespace in it is part of the data. */
  preserve: boolean;
  /** Offsets in the source: the "<", after the start tag's ">", the "</" and after the end tag. */
  start: number;
  openEnd: number;
  closeStart: number;
}

export interface Markup {
  type: "text" | "cdata" | "comment" | "pi" | "doctype" | "declaration";
  /** As written, delimiters included. */
  raw: string;
}

export type XmlNode = Element | Markup;

export interface XmlDocument {
  source: string;
  prolog: Markup[];
  root: Element;
  epilog: Markup[];
}

export type ParseResult = { ok: true; document: XmlDocument; stats: XmlStats; notices: string[] } | { ok: false; error: XmlError };
export type XmlResult = { ok: true; output: string; stats: XmlStats; notices: string[] } | { ok: false; error: XmlError };

const NC_NAME_START = "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const NAME_START = `:${NC_NAME_START}`;
const NC_NAME_CHAR = `${NC_NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const NAME_CHAR = `:${NC_NAME_CHAR}`;
const NAME_SOURCE = `[${NAME_START}][${NAME_CHAR}]*`;
const NAME = new RegExp(NAME_SOURCE, "uy");
const REFERENCE = new RegExp(`&(?:#([0-9]+)|#x([0-9a-fA-F]+)|(${NAME_SOURCE}));`, "uy");
const ENTITY_DECLARATION = new RegExp(`<!ENTITY[ \\t\\n]+(%[ \\t\\n]+)?(${NAME_SOURCE})`, "uy");
const NAME_START_CHAR = new RegExp(`[${NAME_START}]`, "u");
const WHITESPACE = /[ \t\n]*/y;
const NOT_WHITESPACE = /[^ \t\n]/;
/** Control characters, and surrogates without their other half, can't appear in XML 1.0 at all. */
export const FORBIDDEN_CHAR = /[\0-\x08\x0B\x0C\x0E-\x1F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const PREDEFINED_ENTITIES = new Set(["lt", "gt", "amp", "quot", "apos"]);

/** A name without a namespace prefix: an element, attribute or prefix name. */
export const NC_NAME = new RegExp(`^[${NC_NAME_START}][${NC_NAME_CHAR}]*$`, "u");
/** Characters a name can't have anywhere, and ones it can't start with. */
export const NOT_NC_NAME_CHAR = new RegExp(`[^${NC_NAME_CHAR}]`, "gu");
export const NC_NAME_START_CHAR = new RegExp(`^[${NC_NAME_START}]`, "u");

const isXmlChar = (cp: number) => cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);

class ParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

class Parser {
  private pos = 0;
  private readonly stats = { elements: 0, attributes: 0, depth: 0 };
  private readonly declaredEntities = new Set<string>();
  /** A DOCTYPE that pulls in other declarations, so an entity this can't see may still be defined. */
  private externalDeclarations = false;
  private readonly uncheckedEntities = new Set<string>();
  /** Entities declared with SYSTEM or PUBLIC: their text is in another file, which is never loaded. */
  private readonly externalEntities = new Set<string>();
  private encoding: string | undefined;

  constructor(private readonly src: string) {}

  parse(): { document: XmlDocument; stats: XmlStats; notices: string[] } {
    const { src } = this;
    if (src === "") this.fail("The input is empty. Paste some XML.");
    const bad = FORBIDDEN_CHAR.exec(src);
    if (bad) this.fail(`Character U+${bad[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")} isn't allowed in XML.`, bad.index);

    const prolog: Markup[] = [];
    const epilog: Markup[] = [];
    let root: Element | undefined;
    let doctype = false;
    if (/^<\?xml[ \t\n?]/.test(src)) prolog.push(this.declaration());
    for (;;) {
      this.skipWhitespace();
      if (this.pos >= src.length) break;
      const into = root ? epilog : prolog;
      if (this.at("<!--")) into.push(this.comment());
      else if (this.at("<?")) into.push(this.processingInstruction());
      else if (this.at("<!DOCTYPE")) {
        if (root) this.fail("A <!DOCTYPE> has to come before the root element.");
        if (doctype) this.fail("There can only be one <!DOCTYPE>.");
        doctype = true;
        prolog.push(this.doctype());
      } else if (this.at("<![CDATA[")) this.fail("CDATA sections have to be inside the root element.");
      else if (this.at("</")) this.fail("This closing tag has no element to close.");
      else if (this.at("<!")) this.fail("Expected <!-- or <!DOCTYPE here.");
      else if (this.at("<")) {
        if (root) {
          NAME.lastIndex = this.pos + 1;
          const second = NAME.exec(src)?.[0];
          this.fail(`Only one root element is allowed, but ${second ? `<${second}>` : "this"} starts a second. Wrap them in one element.`);
        }
        root = this.element();
      } else this.fail(root ? "Text isn't allowed after the root element." : "Text isn't allowed outside the root element.");
    }
    if (!root) this.fail("There's no root element. XML needs one element that holds everything else.");

    const notices: string[] = [];
    if (this.uncheckedEntities.size > 0) {
      const names = [...this.uncheckedEntities].map((n) => `&${n};`).join(", ");
      notices.push(`${names} must come from an external DTD. It's not loaded, so ${this.uncheckedEntities.size === 1 ? "it wasn't" : "they weren't"} checked.`);
    }
    if (this.externalEntities.size > 0) {
      const one = this.externalEntities.size === 1;
      notices.push(
        `${[...this.externalEntities].join(", ")} ${one ? "points to another file or URL. It's" : "point to other files or URLs. They're"} never loaded here, and kept as written.`,
      );
    }
    if (this.encoding && !/^utf-?8$/i.test(this.encoding) && /[^\x00-\x7F]/.test(src)) {
      notices.push(`The declaration says encoding="${this.encoding}", but copying or downloading gives UTF-8. Change it to encoding="UTF-8", or save the result as ${this.encoding}.`);
    }
    return { document: { source: src, prolog, root, epilog }, stats: { root: root.name, ...this.stats }, notices };
  }

  private fail(message: string, offset = this.pos): never {
    throw new ParseError(message, offset);
  }

  private at(text: string): boolean {
    return this.src.startsWith(text, this.pos);
  }

  private skipWhitespace(): boolean {
    WHITESPACE.lastIndex = this.pos;
    WHITESPACE.exec(this.src);
    const moved = WHITESPACE.lastIndex > this.pos;
    this.pos = WHITESPACE.lastIndex;
    return moved;
  }

  private name(what: string): string {
    NAME.lastIndex = this.pos;
    const match = NAME.exec(this.src);
    if (!match) {
      const found = this.src.codePointAt(this.pos);
      this.fail(found === undefined ? `Expected ${what}, but the input ended.` : `Expected ${what}, found "${String.fromCodePoint(found)}". Names start with a letter, _ or :.`);
    }
    this.pos = NAME.lastIndex;
    return match[0];
  }

  /** A name that may have a namespace prefix. */
  private qualifiedName(what: string): string {
    const start = this.pos;
    const name = this.name(what);
    if (name.includes(":") && !/^[^:]+:[^:]+$/.test(name)) this.fail(`${name} isn't a valid name. It can have one : at most, with text on both sides.`, start);
    return name;
  }

  private declaration(): Markup {
    const start = this.pos;
    const end = this.src.indexOf("?>", start);
    if (end < 0) this.fail("The XML declaration is never closed with ?>.");
    const raw = this.src.slice(start, end + 2);
    if (!/^<\?xml[ \t\n]+version[ \t\n]*=[ \t\n]*(["'])1\.[0-9]+\1/.test(raw)) this.fail('The XML declaration has to start with a version, like <?xml version="1.0"?>.');
    this.encoding = /[ \t\n]encoding[ \t\n]*=[ \t\n]*(["'])([A-Za-z][\w.-]*)\1/.exec(raw)?.[2];
    this.pos = end + 2;
    return { type: "declaration", raw };
  }

  private comment(): Markup {
    const start = this.pos;
    const end = this.src.indexOf("-->", start + 4);
    if (end < 0) this.fail("This comment is never closed with -->.");
    const dashes = this.src.slice(start + 4, end).indexOf("--");
    if (dashes >= 0) this.fail("Comments can't contain -- inside them.", start + 4 + dashes);
    if (end > start + 4 && this.src[end - 1] === "-") this.fail("A comment can't end with --->.", end - 1);
    this.pos = end + 3;
    return { type: "comment", raw: this.src.slice(start, this.pos) };
  }

  private processingInstruction(): Markup {
    const start = this.pos;
    this.pos += 2;
    const target = this.name("a processing instruction name");
    if (target.toLowerCase() === "xml") this.fail("The XML declaration <?xml … ?> is only allowed at the very start of the document.", start);
    const end = this.src.indexOf("?>", this.pos);
    if (end < 0) this.fail("This processing instruction is never closed with ?>.", start);
    if (end > this.pos && !this.skipWhitespace()) this.fail("Expected a space after the processing instruction's name.");
    this.pos = end + 2;
    return { type: "pi", raw: this.src.slice(start, this.pos) };
  }

  private cdata(): Markup {
    const start = this.pos;
    const end = this.src.indexOf("]]>", start + 9);
    if (end < 0) this.fail("This CDATA section is never closed with ]]>.");
    this.pos = end + 3;
    return { type: "cdata", raw: this.src.slice(start, this.pos) };
  }

  /** Kept as written. Only read far enough to find its end and the entities it declares. */
  private doctype(): Markup {
    const { src } = this;
    const start = this.pos;
    this.pos += "<!DOCTYPE".length;
    if (!this.skipWhitespace()) this.fail("Expected a space after <!DOCTYPE.");
    this.name("the root element's name");
    this.skipWhitespace();
    if (this.at("SYSTEM") || this.at("PUBLIC")) this.externalDeclarations = true;
    let subset = false;
    while (this.pos < src.length) {
      const c = src[this.pos];
      if (c === '"' || c === "'") this.skipQuoted();
      else if (c === "[" && !subset) {
        subset = true;
        this.pos++;
        this.internalSubset();
      } else if (c === ">") {
        this.pos++;
        return { type: "doctype", raw: src.slice(start, this.pos) };
      } else this.pos++;
    }
    this.fail("This <!DOCTYPE> is never closed with >.", start);
  }

  private internalSubset(): void {
    const { src } = this;
    const start = this.pos - 1;
    while (this.pos < src.length) {
      const c = src[this.pos];
      if (c === "]") {
        this.pos++;
        return;
      }
      if (c === '"' || c === "'") this.skipQuoted();
      else if (this.at("<!--")) this.comment();
      else if (this.at("<?")) this.processingInstruction();
      else if (this.at("<!ENTITY")) {
        ENTITY_DECLARATION.lastIndex = this.pos;
        const match = ENTITY_DECLARATION.exec(src);
        if (match && !match[1]) this.declaredEntities.add(match[2]);
        this.pos = match ? ENTITY_DECLARATION.lastIndex : this.pos + 1;
        this.skipWhitespace();
        if (match && (this.at("SYSTEM") || this.at("PUBLIC"))) this.externalEntities.add(`${match[1] ? "%" : "&"}${match[2]};`);
      } else {
        // A parameter entity reference can bring in declarations from anywhere.
        if (c === "%" && NAME_START_CHAR.test(src[this.pos + 1] ?? "")) this.externalDeclarations = true;
        this.pos++;
      }
    }
    this.fail("The [ in this <!DOCTYPE> is never closed with ].", start);
  }

  private skipQuoted(): void {
    const close = this.src.indexOf(this.src[this.pos], this.pos + 1);
    if (close < 0) this.fail("This quoted value is never closed.");
    this.pos = close + 1;
  }

  /** Checks the & references in text or an attribute value that starts at `base`. */
  private checkReferences(raw: string, base: number): void {
    for (let i = raw.indexOf("&"); i >= 0; i = raw.indexOf("&", i + 1)) {
      REFERENCE.lastIndex = i;
      const match = REFERENCE.exec(raw);
      if (!match) this.fail("A & on its own has to be written &amp;.", base + i);
      const [ref, decimal, hex, name] = match;
      if (name === undefined) {
        if (!isXmlChar(decimal !== undefined ? Number(decimal) : parseInt(hex, 16))) this.fail(`${ref} is a character that isn't allowed in XML.`, base + i);
      } else if (!PREDEFINED_ENTITIES.has(name) && !this.declaredEntities.has(name)) {
        if (this.externalDeclarations) this.uncheckedEntities.add(name);
        else if (name === "nbsp") this.fail("&nbsp; isn't defined in XML. Write &#160; for a non-breaking space.", base + i);
        else this.fail(`${ref} isn't defined. XML only has &lt; &gt; &amp; &quot; and &apos; built in. Use a character reference like &#169;, or declare it in a <!DOCTYPE>.`, base + i);
      }
    }
  }

  private lineOf(offset: number): number {
    let line = 1;
    for (let i = this.src.indexOf("\n"); i >= 0 && i < offset; i = this.src.indexOf("\n", i + 1)) line++;
    return line;
  }

  private startTag(parent: Element | undefined, parentScope: Set<string>): { element: Element; scope: Set<string> } {
    const { src } = this;
    const start = this.pos;
    this.pos++;
    if (!NAME_START_CHAR.test(String.fromCodePoint(src.codePointAt(this.pos) ?? 0))) {
      this.fail(`Expected an element name after <. A < in text has to be written &lt;.`);
    }
    const name = this.qualifiedName("an element name");
    const attributes: Attribute[] = [];
    const positions: number[] = [];
    for (;;) {
      const spaced = this.skipWhitespace();
      if (this.at(">") || this.at("/>")) break;
      if (this.pos >= src.length) this.fail(`<${name}> is never closed with >.`, start);
      if (!spaced) this.fail("Expected a space between attributes.");
      const at = this.pos;
      const attribute = this.qualifiedName("an attribute name, > or />");
      if (attributes.some((a) => a.name === attribute)) this.fail(`The attribute ${attribute} appears twice on <${name}>.`, at);
      this.skipWhitespace();
      if (!this.at("=")) this.fail(`Expected = after the attribute ${attribute}.`);
      this.pos++;
      this.skipWhitespace();
      const quote = src[this.pos];
      if (quote !== '"' && quote !== "'") this.fail(`Attribute values need quotes, like ${attribute}="…".`);
      const close = src.indexOf(quote, this.pos + 1);
      if (close < 0) this.fail(`The value of ${attribute} is never closed with ${quote}.`);
      const value = src.slice(this.pos + 1, close);
      const lt = value.indexOf("<");
      if (lt >= 0) this.fail("A < in an attribute value has to be written &lt;.", this.pos + 1 + lt);
      this.checkReferences(value, this.pos + 1);
      attributes.push({ name: attribute, value });
      positions.push(at);
      this.pos = close + 1;
    }

    let scope = parentScope;
    for (const { name: attribute } of attributes) {
      if (!attribute.startsWith("xmlns:")) continue;
      if (scope === parentScope) scope = new Set(parentScope);
      scope.add(attribute.slice("xmlns:".length));
    }
    const checkPrefix = (qname: string, at: number) => {
      const prefix = qname.includes(":") ? qname.slice(0, qname.indexOf(":")) : null;
      if (prefix !== null && prefix !== "xml" && prefix !== "xmlns" && !scope.has(prefix)) {
        this.fail(`The prefix ${prefix} isn't declared. Add xmlns:${prefix}="…" to this element or one around it.`, at);
      }
    };
    checkPrefix(name, start + 1);
    attributes.forEach((a, i) => checkPrefix(a.name, positions[i]));

    const space = attributes.find((a) => a.name === "xml:space")?.value;
    const selfClosing = this.at("/>");
    this.pos += selfClosing ? 2 : 1;
    this.stats.elements++;
    this.stats.attributes += attributes.length;
    const element: Element = {
      type: "element",
      name,
      attributes,
      children: [],
      selfClosing,
      preserve: space === "preserve" || (space !== "default" && (parent?.preserve ?? false)),
      start,
      openEnd: this.pos,
      closeStart: this.pos,
    };
    return { element, scope };
  }

  /** The root element and everything in it, without recursion so any depth is fine. */
  private element(): Element {
    const { src } = this;
    const first = this.startTag(undefined, new Set());
    this.stats.depth = 1;
    if (first.element.selfClosing) return first.element;
    const open = [first];
    while (open.length > 0) {
      const { element: top, scope } = open[open.length - 1];
      if (this.pos >= src.length) this.fail(`<${top.name}> on line ${this.lineOf(top.start)} is never closed.`, top.start);
      if (this.at("</")) {
        const at = this.pos;
        this.pos += 2;
        const name = this.name("the closing tag's name");
        this.skipWhitespace();
        if (!this.at(">")) this.fail(`Expected > to end </${name}>.`);
        if (name !== top.name) this.fail(`</${name}> doesn't match <${top.name}>, opened on line ${this.lineOf(top.start)}.`, at);
        top.closeStart = at;
        this.pos++;
        open.pop();
      } else if (this.at("<!--")) top.children.push(this.comment());
      else if (this.at("<![CDATA[")) top.children.push(this.cdata());
      else if (this.at("<?")) top.children.push(this.processingInstruction());
      else if (this.at("<!")) this.fail(this.at("<!DOCTYPE") ? "A <!DOCTYPE> has to come before the root element." : "Expected <!-- or <![CDATA[ here.");
      else if (this.at("<")) {
        const child = this.startTag(top, scope);
        top.children.push(child.element);
        this.stats.depth = Math.max(this.stats.depth, open.length + 1);
        if (!child.element.selfClosing) open.push(child);
      } else {
        const start = this.pos;
        const next = src.indexOf("<", start);
        this.pos = next < 0 ? src.length : next;
        const raw = src.slice(start, this.pos);
        const cdataEnd = raw.indexOf("]]>");
        if (cdataEnd >= 0) this.fail("]]> isn't allowed in text. Write ]]&gt; instead.", start + cdataEnd);
        this.checkReferences(raw, start);
        top.children.push({ type: "text", raw });
      }
    }
    return first.element;
  }
}

function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line: before.split("\n").length, column: offset - lineStart + 1 };
}

export function parseXml(text: string): ParseResult {
  // A byte order mark isn't content, and XML reads every line ending as \n.
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  try {
    return { ok: true, ...new Parser(src).parse() };
  } catch (err) {
    if (!(err instanceof ParseError)) throw err;
    return { ok: false, error: { message: err.message, ...position(src, err.offset) } };
  }
}

const INDENTS: Record<XmlOptions["indent"], string> = { "2": "  ", "4": "    ", tab: "\t" };

function orderAttributes(attributes: Attribute[], options: XmlOptions): Attribute[] {
  if (!options.sortAttributes) return attributes;
  const group = (name: string) => (name === "xmlns" ? 0 : name.startsWith("xmlns:") ? 1 : 2);
  return [...attributes].sort((a, b) => group(a.name) - group(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// A value written in single quotes can hold a ", so it keeps them; any other gets double quotes.
const attributeText = ({ name, value }: Attribute) => (value.includes('"') ? `${name}='${value}'` : `${name}="${value}"`);

/** `indent` is the tag's own indentation when attributes go on their own lines. */
function startTag(element: Element, options: XmlOptions, end: ">" | "/>", indent?: string): string {
  const attributes = orderAttributes(element.attributes, options).map(attributeText);
  if (indent !== undefined && options.attributesPerLine && attributes.length > 1) {
    const inner = indent + INDENTS[options.indent];
    return `<${element.name}\n${attributes.map((a) => inner + a).join("\n")}${end}`;
  }
  return `<${[element.name, ...attributes].join(" ")}${end}`;
}

/** Holds text, so whitespace in it is data. Whitespace between child elements is only layout. */
function holdsText(element: Element): boolean {
  let structure = false;
  for (const child of element.children) {
    if (child.type === "cdata" || (child.type === "text" && NOT_WHITESPACE.test(child.raw))) return true;
    if (child.type !== "text") structure = true;
  }
  return !structure;
}

function formatElement(element: Element, depth: number, document: XmlDocument, options: XmlOptions, out: string[]): void {
  const indent = INDENTS[options.indent].repeat(depth);
  if (element.selfClosing) {
    out.push(indent + startTag(element, options, "/>", indent));
    return;
  }
  const open = indent + startTag(element, options, ">", indent);
  const close = `</${element.name}>`;
  if (element.children.length === 0) out.push(open + close);
  else if (element.preserve || holdsText(element)) out.push(open + document.source.slice(element.openEnd, element.closeStart) + close);
  else {
    out.push(open);
    for (const child of element.children) {
      if (child.type === "element") formatElement(child, depth + 1, document, options, out);
      else if (child.type !== "text") out.push(INDENTS[options.indent].repeat(depth + 1) + child.raw);
    }
    out.push(indent + close);
  }
}

function minifyElement(element: Element, options: XmlOptions, keepWhitespace: boolean, out: string[]): void {
  if (element.children.length === 0) {
    out.push(startTag(element, options, "/>"));
    return;
  }
  out.push(startTag(element, options, ">"));
  const keep = keepWhitespace || element.preserve || holdsText(element);
  for (const child of element.children) {
    if (child.type === "element") minifyElement(child, options, keep, out);
    else if (child.type === "comment" && options.removeComments) continue;
    else if (child.type !== "text" || keep) out.push(child.raw);
  }
  out.push(`</${element.name}>`);
}

/** Very deep nesting can run out of stack while writing the result, though parsing is fine. */
function serialize(text: string, write: (document: XmlDocument) => string): XmlResult {
  const parsed = parseXml(text);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, output: write(parsed.document), stats: parsed.stats, notices: parsed.notices };
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    return { ok: false, error: { message: `This XML is valid, but nested too deeply (${parsed.stats.depth.toLocaleString("en-US")} levels) to rewrite here.`, line: 1, column: 1 } };
  }
}

export function formatXml(text: string, options: XmlOptions): XmlResult {
  return serialize(text, (document) => {
    const out = document.prolog.map((node) => node.raw);
    formatElement(document.root, 0, document, options, out);
    out.push(...document.epilog.map((node) => node.raw));
    return out.join("\n") + "\n";
  });
}

export function minifyXml(text: string, options: XmlOptions): XmlResult {
  return serialize(text, (document) => {
    const outside = (nodes: Markup[]) => nodes.filter((node) => !(node.type === "comment" && options.removeComments)).map((node) => node.raw);
    const out = outside(document.prolog);
    minifyElement(document.root, options, false, out);
    out.push(...outside(document.epilog));
    return out.join("");
  });
}

/**
 * Reads a file's bytes the way an XML parser would: by its byte order mark, then the encoding its
 * declaration names, then as UTF-8.
 */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const head = String.fromCharCode(...bytes.subarray(0, 200));
  const declared = /^<\?xml[^>]*?[ \t\r\n]encoding[ \t\r\n]*=[ \t\r\n]*["']([A-Za-z][\w.:-]*)["']/.exec(head)?.[1];
  // Bytes without a UTF-16 byte order mark aren't UTF-16, whatever the declaration says.
  if (declared && !/^utf-?(8|16)/i.test(declared)) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // Not an encoding the browser knows.
    }
  }
  return new TextDecoder().decode(bytes);
}

export interface XmlRequest {
  text: string;
  mode: "format" | "minify";
  options: XmlOptions;
}

export type XmlJobResult = { mode: XmlRequest["mode"] } & ({ ok: false; error: XmlError } | { ok: true; output: string; stats: XmlStats; notices: string[]; sizes: SizeChange });

export async function processXml({ text, mode, options }: XmlRequest): Promise<XmlJobResult> {
  const result = mode === "format" ? formatXml(text, options) : minifyXml(text, options);
  if (!result.ok) return { ...result, mode };
  return { ...result, mode, sizes: await measureSizeChange(text, result.output) };
}
