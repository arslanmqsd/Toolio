/**
 * Strict JSON parser and printer. Unlike JSON.parse it keeps numbers and
 * string escapes exactly as written (so 9007199254740993 isn't rounded), and
 * reports errors with the same wording and position in every browser.
 */

export type JsonNode =
  | { type: "object"; entries: { key: string; rawKey: string; value: JsonNode }[] }
  | { type: "array"; items: JsonNode[] }
  | { type: "string"; raw: string }
  | { type: "number"; raw: string }
  | { type: "boolean"; raw: "true" | "false" }
  | { type: "null"; raw: "null" };

export interface JsonSyntaxError {
  message: string;
  offset: number;
  line: number;
  column: number;
}

export interface JsonStats {
  root: JsonNode["type"];
  keys: number;
  depth: number;
  counts: Record<JsonNode["type"], number>;
  /** Integers beyond Number.MAX_SAFE_INTEGER, which JSON.parse would round. */
  unsafeIntegers: number;
  duplicateKeys: string[];
}

const MAX_DEPTH = 500;

class ParseError extends Error {
  constructor(
    message: string,
    public offset: number,
  ) {
    super(message);
  }
}

function describe(ch: string | undefined): string {
  if (ch === undefined) return "the end of the input";
  if (ch === "\n") return "a line break";
  if (ch === "\t") return "a tab";
  return `"${ch}"`;
}

export function locate(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseJson(text: string): { ok: true; value: JsonNode; stats: JsonStats } | { ok: false; error: JsonSyntaxError } {
  let i = 0;
  const stats: JsonStats = {
    root: "null",
    keys: 0,
    depth: 0,
    counts: { object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 0 },
    unsafeIntegers: 0,
    duplicateKeys: [],
  };

  const skipWhitespace = () => {
    while (i < text.length) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
      else if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) throw new ParseError("Comments aren't allowed in JSON.", i);
      else break;
    }
  };

  function parseString(): string {
    const start = i;
    i++; // opening quote
    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        i++;
        return text.slice(start, i);
      }
      if (c === "\\") {
        const e = text[i + 1];
        if (e === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
            throw new ParseError("\\u must be followed by four hex digits.", i);
          }
          i += 6;
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) {
          i += 2;
        } else {
          throw new ParseError(`Invalid escape "\\${e ?? ""}" in string.`, i);
        }
        continue;
      }
      if (c.charCodeAt(0) < 0x20) {
        throw new ParseError(
          c === "\n" ? "Strings can't contain line breaks; use \\n instead." : "Strings can't contain control characters; escape them.",
          i,
        );
      }
      i++;
    }
    throw new ParseError("This string is never closed; add a closing \".", start);
  }

  function parseValue(depth: number): JsonNode {
    if (depth > MAX_DEPTH) throw new ParseError(`Nested more than ${MAX_DEPTH} levels deep.`, i);
    stats.depth = Math.max(stats.depth, depth);
    skipWhitespace();
    const c = text[i];

    if (c === "{") {
      i++;
      stats.counts.object++;
      const entries: { key: string; rawKey: string; value: JsonNode }[] = [];
      const seen = new Set<string>();
      skipWhitespace();
      if (text[i] === "}") {
        i++;
        return { type: "object", entries };
      }
      for (;;) {
        skipWhitespace();
        if (text[i] !== '"') {
          if (text[i] === "}" && entries.length) throw new ParseError('Trailing comma before "}"; remove it.', i);
          throw new ParseError(
            text[i] === "'" || /[A-Za-z_$]/.test(text[i] ?? "")
              ? "Property names must be in double quotes."
              : `Expected a property name, but found ${describe(text[i])}.`,
            i,
          );
        }
        const rawKey = parseString();
        const key = JSON.parse(rawKey) as string;
        if (seen.has(key)) stats.duplicateKeys.push(key);
        seen.add(key);
        skipWhitespace();
        if (text[i] !== ":") throw new ParseError(`Expected ":" after property name, but found ${describe(text[i])}.`, i);
        i++;
        entries.push({ key, rawKey, value: parseValue(depth + 1) });
        stats.keys++;
        skipWhitespace();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return { type: "object", entries };
        }
        throw new ParseError(`Expected "," or "}" after a property, but found ${describe(text[i])}.`, i);
      }
    }

    if (c === "[") {
      i++;
      stats.counts.array++;
      const items: JsonNode[] = [];
      skipWhitespace();
      if (text[i] === "]") {
        i++;
        return { type: "array", items };
      }
      for (;;) {
        skipWhitespace();
        if (text[i] === "]" && items.length) throw new ParseError('Trailing comma before "]"; remove it.', i);
        items.push(parseValue(depth + 1));
        skipWhitespace();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          return { type: "array", items };
        }
        throw new ParseError(`Expected "," or "]" after an array item, but found ${describe(text[i])}.`, i);
      }
    }

    if (c === '"') {
      stats.counts.string++;
      return { type: "string", raw: parseString() };
    }
    if (c === "'") throw new ParseError("Strings must use double quotes.", i);

    for (const literal of ["true", "false", "null"] as const) {
      if (text.startsWith(literal, i)) {
        i += literal.length;
        if (literal === "null") {
          stats.counts.null++;
          return { type: "null", raw: literal };
        }
        stats.counts.boolean++;
        return { type: "boolean", raw: literal };
      }
    }

    if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) {
      NUMBER.lastIndex = i;
      const match = NUMBER.exec(text);
      if (!match || /^[0-9.eE+-]/.test(text[i + match[0].length] ?? "")) {
        throw new ParseError("Invalid number. JSON numbers can't have leading zeros, a trailing \".\", or a \"+\" sign.", i);
      }
      i += match[0].length;
      stats.counts.number++;
      if (/^-?\d+$/.test(match[0]) && !Number.isSafeInteger(Number(match[0]))) stats.unsafeIntegers++;
      return { type: "number", raw: match[0] };
    }

    if (c === undefined) throw new ParseError("Expected a value, but the input ended.", i);
    if (/^(NaN|Infinity|undefined)/.test(text.slice(i))) {
      throw new ParseError(`${text.slice(i).match(/^\w+/)![0]} isn't valid JSON; use null or a number.`, i);
    }
    if (c === "+" || c === ".") {
      throw new ParseError("Invalid number. JSON numbers can't have leading zeros, a trailing \".\", or a \"+\" sign.", i);
    }
    throw new ParseError(`Expected a value, but found ${describe(c)}.`, i);
  }

  try {
    skipWhitespace();
    if (i >= text.length) throw new ParseError("Input is empty. Paste some JSON.", 0);
    const value = parseValue(0);
    skipWhitespace();
    if (i < text.length) throw new ParseError(`Unexpected ${describe(text[i])} after the end of the JSON value.`, i);
    stats.root = value.type;
    return { ok: true, value, stats };
  } catch (err) {
    if (!(err instanceof ParseError)) throw err;
    return { ok: false, error: { message: err.message, offset: err.offset, ...locate(text, err.offset) } };
  }
}

export interface FormatOptions {
  /** Indent string, e.g. "  " or "\t". Empty string minifies. */
  indent: string;
  sortKeys: boolean;
}

export function printJson(node: JsonNode, { indent, sortKeys }: FormatOptions): string {
  const pretty = indent !== "";

  function print(n: JsonNode, level: number): string {
    if (n.type === "object") {
      if (n.entries.length === 0) return "{}";
      const entries = sortKeys ? [...n.entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) : n.entries;
      if (!pretty) return `{${entries.map((e) => `${e.rawKey}:${print(e.value, 0)}`).join(",")}}`;
      const pad = indent.repeat(level + 1);
      return `{\n${entries.map((e) => `${pad}${e.rawKey}: ${print(e.value, level + 1)}`).join(",\n")}\n${indent.repeat(level)}}`;
    }
    if (n.type === "array") {
      if (n.items.length === 0) return "[]";
      if (!pretty) return `[${n.items.map((item) => print(item, 0)).join(",")}]`;
      const pad = indent.repeat(level + 1);
      return `[\n${n.items.map((item) => pad + print(item, level + 1)).join(",\n")}\n${indent.repeat(level)}]`;
    }
    return n.raw;
  }

  return print(node, 0);
}

export type FormatResult =
  | { ok: true; output: string; stats: JsonStats }
  | { ok: false; error: JsonSyntaxError };

export function formatJson(text: string, options: FormatOptions): FormatResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, output: printJson(parsed.value, options), stats: parsed.stats };
}
