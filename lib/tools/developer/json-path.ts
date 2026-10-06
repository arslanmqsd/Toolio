import { JSONPath } from "jsonpath-plus";
import { parseJson, type JsonSyntaxError } from "./json-format";

export interface JsonPathMatch {
  /** Where the match is, e.g. $.store.book[0].title. */
  path: string;
  value: unknown;
}

export interface PathSyntaxError {
  message: string;
  /** Character in the path the problem is at, when known. */
  offset: number | null;
}

export type JsonPathQuery = { ok: true; matches: JsonPathMatch[] } | { ok: false; error: PathSyntaxError };

/**
 * Runs `path` on an already parsed document. Paths are untrusted input, so filter and script
 * expressions run in jsonpath-plus's "safe" evaluator: a small interpreter for a subset of
 * JavaScript that never calls eval or Function and refuses to reach constructors.
 *
 * A filter that fails on an item (reading a property of a missing value, or a blocked constructor)
 * counts as not matching it, as the JSONPath standard has it. Filters that don't parse still throw.
 */
export function queryJsonPath(json: unknown, path: string): JsonPathQuery {
  const syntaxError = checkPathSyntax(path);
  if (syntaxError) return { ok: false, error: syntaxError };
  try {
    const results = JSONPath({
      path: path.trim(),
      json: json as object,
      resultType: "all",
      eval: "safe",
      ignoreEvalErrors: true,
      wrap: true,
    }) as { pointer: string; value: unknown }[];
    return { ok: true, matches: results.map((r) => ({ path: formatPointer(json, r.pointer), value: r.value })) };
  } catch (err) {
    return { ok: false, error: { message: `${(err as Error).message}.`.replace(/\.\.$/, "."), offset: null } };
  }
}

const OPENERS: Record<string, string> = { "[": "]", "(": ")" };
const CLOSERS: Record<string, string> = { "]": "[", ")": "(" };

/**
 * Structural checks jsonpath-plus skips: it quietly ignores a missing "]" or a trailing ".", so
 * "$.store[" would look like a working path. Returns the first problem, or null.
 */
export function checkPathSyntax(rawPath: string): PathSyntaxError | null {
  const lead = rawPath.length - rawPath.trimStart().length;
  const path = rawPath.trim();
  const at = (message: string, offset: number): PathSyntaxError => ({ message, offset: offset + lead });

  if (!path.startsWith("$")) return at("Start the path with $, the root of the document.", 0);

  const open: { ch: string; offset: number }[] = [];
  let quote: { ch: string; offset: number } | null = null;

  for (let i = 1; i < path.length; i++) {
    const ch = path[i];

    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote.ch) quote = null;
      continue;
    }

    if (open.length > 0) {
      if (ch === "'" || ch === '"') quote = { ch, offset: i };
      else if (ch in OPENERS) open.push({ ch, offset: i });
      else if (ch in CLOSERS) {
        const top = open[open.length - 1];
        if (top.ch !== CLOSERS[ch]) return at(`Expected ${OPENERS[top.ch]} before ${ch}.`, i);
        if (ch === "]" && path.slice(top.offset + 1, i).trim() === "") return at("Empty brackets. Put an index, a name, * or a filter inside.", top.offset);
        open.pop();
      }
      continue;
    }

    if (ch === "[") open.push({ ch, offset: i });
    else if (ch === "]" || ch === ")") return at(`${ch} has no matching ${CLOSERS[ch]}.`, i);
    else if (ch === "(") return at("( only goes inside brackets, as in [?(@.price < 10)].", i);
    else if (/\s/.test(ch)) return at("Unexpected space. Use ['a name'] for names with spaces.", i);
    else if (ch === ".") {
      const descent = path[i + 1] === ".";
      const next = path[i + (descent ? 2 : 1)];
      if (next === undefined) return at(descent ? "Add a name, * or [ ] after .." : "Add a name or * after the dot.", i);
      if (next === ".") return at("Too many dots. Use . for a child or .. to search all levels.", i);
      if (!descent && next === "[") return at("Drop the dot before [, as in $.store['book'].", i);
      if (descent) i++;
    }
  }

  if (quote) return at(`Unclosed quote. Add a matching ${quote.ch}.`, quote.offset);
  if (open.length > 0) {
    const top = open[open.length - 1];
    return at(`Unclosed ${top.ch}. Add a matching ${OPENERS[top.ch]}.`, top.offset);
  }
  return null;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * A JSON Pointer as a JSONPath in dot notation: $.store.book[0]['a b']. Walks the document so an
 * array index and an object key named "0" come out differently ([0] and ['0']).
 */
export function formatPointer(root: unknown, pointer: string): string {
  if (pointer === "") return "$";
  let out = "$";
  let node = root;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(node)) {
      out += `[${key}]`;
      node = node[Number(key)];
    } else {
      out += IDENTIFIER.test(key) ? `.${key}` : `['${key.replace(/[\\']/g, "\\$&")}']`;
      node = node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
    }
  }
  return out;
}

/** Matches listed one by one; the copied results always have them all. */
export const MAX_LISTED_MATCHES = 1000;
const MAX_PREVIEW_CHARS = 2000;

export type JsonPathOutcome =
  | { kind: "json-error"; error: JsonSyntaxError }
  | { kind: "no-path" }
  | { kind: "path-error"; error: PathSyntaxError }
  | {
      kind: "matches";
      total: number;
      /** The first MAX_LISTED_MATCHES, each value as indented JSON, shortened if long. */
      matches: { path: string; json: string; shortened: boolean }[];
      /** Every matched value as one indented JSON array. */
      valuesJson: string;
      /** Integers in the document beyond Number.MAX_SAFE_INTEGER, which come out rounded. */
      unsafeIntegers: number;
    };

type ParsedDocument = { ok: true; json: unknown; unsafeIntegers: number } | { ok: false; error: JsonSyntaxError };

// The last document parsed, so editing the path doesn't parse a big document again on every key.
let lastParse: { text: string; result: ParsedDocument } | null = null;

function parseDocument(text: string): ParsedDocument {
  if (lastParse?.text === text) return lastParse.result;
  // parseJson for its precise error positions; JSON.parse for plain values to query.
  const parsed = parseJson(text);
  const result: ParsedDocument = parsed.ok
    ? { ok: true, json: JSON.parse(text), unsafeIntegers: parsed.stats.unsafeIntegers }
    : { ok: false, error: parsed.error };
  lastParse = { text, result };
  return result;
}

/** Parses `text` and runs `path` on it, with each kind of failure kept apart. */
export function evaluateJsonPath(text: string, path: string): JsonPathOutcome {
  const parsed = parseDocument(text);
  if (!parsed.ok) return { kind: "json-error", error: parsed.error };
  if (path.trim() === "") return { kind: "no-path" };

  const result = queryJsonPath(parsed.json, path);
  if (!result.ok) return { kind: "path-error", error: result.error };

  const values = result.matches.map((m) => m.value);
  return {
    kind: "matches",
    total: result.matches.length,
    matches: result.matches.slice(0, MAX_LISTED_MATCHES).map((m) => {
      const json = JSON.stringify(m.value, null, 2) ?? "undefined";
      const shortened = json.length > MAX_PREVIEW_CHARS;
      return { path: m.path, json: shortened ? `${json.slice(0, MAX_PREVIEW_CHARS)}…` : json, shortened };
    }),
    valuesJson: JSON.stringify(values, null, 2),
    unsafeIntegers: parsed.unsafeIntegers,
  };
}
