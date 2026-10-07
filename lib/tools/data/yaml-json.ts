/**
 * YAML ↔ JSON with the `yaml` package. Beyond converting, it points out where YAML quietly changes
 * data on the way: values YAML 1.1 and 1.2 read differently (NO, on, 1:30, 0755), numbers that
 * don't survive as written (1.10 becomes 1.1), tags, keys and comments JSON can't carry.
 */
import { Document, LineCounter, isAlias, isCollection, isScalar, parseAllDocuments, visit, type Scalar } from "yaml";
import { parseJson, type JsonNode, type JsonSyntaxError } from "@/lib/tools/developer/json-format";

export type YamlVersion = "1.2" | "1.1";

export type NoticeKind = "version" | "number" | "tag" | "key" | "documents" | "aliases" | "comments" | "duplicate";

export interface Notice {
  kind: NoticeKind;
  message: string;
  /** The input line it's about, when it's about one. */
  line?: number;
}

export interface YamlError {
  message: string;
  line: number;
  column: number;
}

export type YamlToJsonResult = { ok: true; output: string; documents: number; notices: Notice[] } | { ok: false; error: YamlError };

export interface YamlToJsonOptions {
  /** 1.2 is the current spec; 1.1 is how PyYAML and much older tooling still read YAML. */
  version?: YamlVersion;
  /** "" for one line. */
  indent?: string;
}

// Expanding more aliases than this is how "billion laughs" files blow up memory.
const MAX_ALIAS_COUNT = 100;

function parseYaml(text: string, version: YamlVersion) {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(text, {
    version,
    lineCounter,
    // Merge keys (<<) are a 1.1 feature, but Docker Compose, GitLab CI and the like rely on them.
    merge: true,
    // Big integers as BigInt so they reach the JSON exactly.
    intAsBigInt: true,
    // The library warns on the console about some inputs; those become notices instead.
    logLevel: "silent",
  });
  return { docs: Array.isArray(docs) ? docs : [docs], lineCounter };
}

export function yamlToJson(text: string, { version = "1.2", indent = "  " }: YamlToJsonOptions = {}): YamlToJsonResult {
  const { docs, lineCounter } = parseYaml(text, version);
  if (docs.length === 0 && /^\s*#/m.test(text)) return { ok: true, output: "null", documents: 0, notices: [{ kind: "comments", message: "Only comments: JSON has no comments, so this is null." }] };
  const lineOf = (offset: number | undefined) => (offset === undefined ? undefined : lineCounter.linePos(offset).line);

  for (const doc of docs) {
    const error = doc.errors[0];
    if (error) {
      const pos = error.linePos?.[0] ?? { line: 1, col: 1 };
      // The library's message repeats the position and quotes the line; keep the first sentence.
      return { ok: false, error: { message: error.message.split(" at line ")[0], line: pos.line, column: pos.col } };
    }
  }

  let values: unknown[];
  try {
    values = docs.map((doc) => doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT }));
  } catch (err) {
    return { ok: false, error: { message: (err as Error).message, line: 1, column: 1 } };
  }

  const notices: Notice[] = [];
  const other: YamlVersion = version === "1.2" ? "1.1" : "1.2";
  const otherDocs = parseYaml(text, other).docs;
  let aliases = 0;
  let comments = false;

  docs.forEach((doc, d) => {
    for (const w of doc.warnings) {
      if (w.code === "TAG_RESOLVE_FAILED") {
        notices.push({ kind: "tag", line: w.linePos?.[0].line, message: `${w.message.split(" at line ")[0]}. Kept as a plain value.` });
      }
    }
    if (doc.commentBefore || doc.comment) comments = true;

    const scalars: Scalar[] = [];
    visit(doc, {
      Alias() {
        aliases++;
      },
      Pair(_, pair) {
        const key = pair.key;
        if (isCollection(key)) notices.push({ kind: "key", line: lineOf(key.range?.[0]), message: "A list or map used as a key becomes its text in JSON." });
        // A merge key (<<) is read as a symbol and applied, never output as a key.
        else if (isScalar(key) && typeof key.value !== "string" && typeof key.value !== "symbol" && !isAlias(key))
          notices.push({ kind: "key", line: lineOf(key.range?.[0]), message: `The key ${key.source ?? String(key.value)} becomes the text "${String(key.value)}" in JSON.` });
      },
      // Specific visitors take precedence over Node, so comments are checked in each.
      Collection(_, node) {
        if (node.commentBefore || node.comment) comments = true;
      },
      Scalar(_, node) {
        if (node.commentBefore || node.comment) comments = true;
        scalars.push(node);
      },
    });

    // Same text, same structure: the scalars line up one to one with the other version's.
    const otherScalars: Scalar[] = [];
    visit(otherDocs[d], { Scalar: (_, node) => void otherScalars.push(node) });

    scalars.forEach((node, i) => {
      // Merge keys (<<) are symbols, and each parse makes its own.
      if (node.type !== "PLAIN" || node.source === undefined || typeof node.value === "symbol") return;
      const line = lineOf(node.range?.[0]);
      const twin = otherScalars[i];
      if (twin && twin.source === node.source && !sameValue(node.value, twin.value)) {
        notices.push({
          kind: "version",
          line,
          message: `${node.source} is ${describe(node.value)} in YAML ${version} but ${describe(twin.value)} in YAML ${other}. Quote it to make it text in both.`,
        });
      }
      if (typeof node.value === "number" || typeof node.value === "bigint") {
        const asJson = typeof node.value === "bigint" ? node.value.toString() : JSON.stringify(node.value);
        if (asJson !== node.source) {
          notices.push({
            kind: "number",
            line,
            message: `${node.source} becomes ${asJson} in JSON.${asJson === "null" ? " JSON has no infinity or NaN." : " If it's meant as text (a version, a code, an ID), quote it."}`,
          });
        }
      }
    });
  });

  if (docs.length > 1) notices.unshift({ kind: "documents", message: `${docs.length} documents (split by ---) became one JSON array, in order.` });
  if (aliases > 0) notices.push({ kind: "aliases", message: `${aliases === 1 ? "1 alias (*name) was" : `${aliases} aliases (*name) were`} expanded into copies of what they point at.` });
  if (comments) notices.push({ kind: "comments", message: "Comments are left out: JSON has no comments." });

  // No documents at all (only comments, or blank) reads as null, like an empty document.
  const value = docs.length === 0 ? null : docs.length === 1 ? values[0] : values;
  return { ok: true, output: toJson(value ?? null, indent), documents: docs.length, notices };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  return typeof a === typeof b && (a === b || (typeof a === "number" && Number.isNaN(a) && Number.isNaN(b)));
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return "text";
  if (value instanceof Date) return `the date ${value.toISOString()}`;
  if (typeof value === "bigint") return `the number ${value}`;
  if (typeof value === "number") return `the number ${value}`;
  return String(value);
}

/** JSON.stringify, but BigInts written as plain integers rather than throwing. */
function toJson(value: unknown, indent: string): string {
  const marker = `bigint:${Math.random().toString(36).slice(2)}:`;
  const text = JSON.stringify(value, (_, v) => (typeof v === "bigint" ? marker + v.toString() : v), indent || undefined);
  return text.replace(new RegExp(`"${marker}(-?\\d+)"`, "g"), "$1");
}

export type JsonToYamlResult = { ok: true; output: string; notices: Notice[] } | { ok: false; error: JsonSyntaxError };

export interface JsonToYamlOptions {
  /** Spaces per level. */
  indent?: number;
  /**
   * Also quote strings YAML 1.1 would misread (no, on, 1:30, 2001-12-14), so PyYAML and older
   * tools read the file the same. The output is valid YAML 1.2 either way.
   */
  compat11?: boolean;
}

export function jsonToYaml(text: string, { indent = 2, compat11 = true }: JsonToYamlOptions = {}): JsonToYamlResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const notices: Notice[] = [];
  if (parsed.stats.duplicateKeys.length > 0) {
    notices.push({ kind: "duplicate", message: `Duplicate keys (${[...new Set(parsed.stats.duplicateKeys)].join(", ")}): only the last value of each is kept.` });
  }

  const doc = new Document(toValue(parsed.value), { version: compat11 ? "1.1" : "1.2", aliasDuplicateObjects: false });
  // Writing with 1.1 rules only adds quotes; nothing written is 1.1-only, so no %YAML directive.
  const output = doc.toString({ indent, lineWidth: 0, directives: false });
  return { ok: true, output, notices };
}

/** A parsed JSON node as a plain value, integers beyond 2^53 as BigInt so their digits survive. */
function toValue(node: JsonNode): unknown {
  switch (node.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      // defineProperty, so a "__proto__" key stays a key and never sets the prototype.
      for (const { key, value } of node.entries) Object.defineProperty(out, key, { value: toValue(value), enumerable: true, writable: true, configurable: true });
      return out;
    }
    case "array":
      return node.items.map(toValue);
    case "string":
      return JSON.parse(node.raw);
    case "number": {
      const n = Number(node.raw);
      return /^-?\d+$/.test(node.raw) && !Number.isSafeInteger(n) ? BigInt(node.raw) : n;
    }
    case "boolean":
      return node.raw === "true";
    case "null":
      return null;
  }
}

