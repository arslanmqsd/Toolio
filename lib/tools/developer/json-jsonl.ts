/**
 * Converts between a JSON array of records and JSON Lines (one JSON value per line, also called
 * NDJSON). Built on the strict parser in json-format, so big integers are kept exactly as written
 * and error messages read the same in every browser.
 */

import { parseJson, printJson, type JsonNode, type JsonSyntaxError } from "./json-format";

export type Direction = "json-to-jsonl" | "jsonl-to-json";

type ObjectNode = Extract<JsonNode, { type: "object" }>;
type Entry = ObjectNode["entries"][number];

export interface LineError {
  /** 1-indexed line in the input, counting blank lines. */
  line: number;
  column: number;
  message: string;
}

export interface ParsedJsonl {
  records: JsonNode[];
  errors: LineError[];
  /** Non-blank lines, valid or not. */
  lines: number;
}

export interface ConvertOptions {
  direction: Direction;
  /** Dot-path nested objects into top-level keys. */
  flatten: boolean;
  /** Top-level keys to keep (after flattening). Empty keeps every key. */
  keep: readonly string[];
  /** Indent for JSON output; empty string minifies. JSONL output is always one compact value per line. */
  indent: string;
}

export type ConvertResult =
  | { ok: false; error: JsonSyntaxError }
  | {
      ok: true;
      output: string;
      records: number;
      /** JSONL lines read (jsonl-to-json) or written (json-to-jsonl). */
      lines: number;
      /** Keys found across the records, in first-seen order, before filtering. */
      fields: string[];
      /** Lines of JSONL input that failed to parse; always empty for JSON input. */
      errors: LineError[];
    };

const BOM = "﻿";
const stripBom = (text: string) => (text.startsWith(BOM) ? text.slice(1) : text);

/** A JSON array's items, or a lone object as one record. */
export function parseJsonRecords(text: string): { ok: true; records: JsonNode[] } | { ok: false; error: JsonSyntaxError } {
  const parsed = parseJson(stripBom(text));
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  if (root.type === "array") return { ok: true, records: root.items };
  if (root.type === "object") return { ok: true, records: [root] };
  const offset = text.length - text.trimStart().length;
  return {
    ok: false,
    error: { message: `Expected an array of records or a single object, but found a ${root.type}.`, offset, line: 1, column: offset + 1 },
  };
}

/** Parses each line on its own, so one bad line doesn't hide the rest. Blank lines are skipped. */
export function parseJsonl(text: string): ParsedJsonl {
  const result: ParsedJsonl = { records: [], errors: [], lines: 0 };
  stripBom(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (line.trim() === "") return;
      result.lines++;
      const parsed = parseJson(line);
      if (parsed.ok) result.records.push(parsed.value);
      else result.errors.push({ line: i + 1, column: parsed.error.column, message: parsed.error.message });
    });
  return result;
}

/**
 * Joins nested object keys with dots: { user: { name: "Ada" } } → { "user.name": "Ada" }. Arrays and
 * empty objects are kept as values. If a flattened key collides with an existing one, the later
 * value wins, as with duplicate keys in JSON.parse. Non-objects are returned unchanged.
 */
export function flattenObject(node: JsonNode): JsonNode {
  if (node.type !== "object") return node;
  const out = new Map<string, Entry>();
  const walk = (obj: ObjectNode, prefix: string) => {
    for (const entry of obj.entries) {
      const key = prefix + entry.key;
      if (entry.value.type === "object" && entry.value.entries.length > 0) {
        walk(entry.value, `${key}.`);
      } else {
        // Top-level keys keep their original escapes; joined keys are re-encoded.
        out.set(key, { key, rawKey: prefix ? JSON.stringify(key) : entry.rawKey, value: entry.value });
      }
    }
  };
  walk(node, "");
  return { type: "object", entries: [...out.values()] };
}

/** Keeps only the listed top-level keys on each object record. Empty `keep` keeps everything. */
export function filterFields(records: JsonNode[], keep: readonly string[]): JsonNode[] {
  if (keep.length === 0) return records;
  const wanted = new Set(keep);
  return records.map((r) => (r.type === "object" ? { type: "object", entries: r.entries.filter((e) => wanted.has(e.key)) } : r));
}

/** Every top-level key across the object records, in first-seen order. */
export function fieldNames(records: JsonNode[]): string[] {
  const names = new Set<string>();
  for (const r of records) if (r.type === "object") for (const e of r.entries) names.add(e.key);
  return [...names];
}

export function toJsonl(records: JsonNode[]): string {
  return records.map((r) => printJson(r, { indent: "", sortKeys: false })).join("\n");
}

export function toJson(records: JsonNode[], indent: string): string {
  return printJson({ type: "array", items: records }, { indent, sortKeys: false });
}

export function convertRecords(text: string, { direction, flatten, keep, indent }: ConvertOptions): ConvertResult {
  let records: JsonNode[];
  let errors: LineError[] = [];
  let lines: number;

  if (direction === "json-to-jsonl") {
    const parsed = parseJsonRecords(text);
    if (!parsed.ok) return parsed;
    records = parsed.records;
    lines = records.length;
  } else {
    if (text.trim() === "") return { ok: false, error: { message: "Input is empty. Paste some JSONL.", offset: 0, line: 1, column: 1 } };
    ({ records, errors, lines } = parseJsonl(text));
  }

  if (flatten) records = records.map(flattenObject);
  const fields = fieldNames(records);
  // Ignore picks that aren't in this input, so stale picks from earlier input don't empty every record.
  records = filterFields(records, keep.filter((k) => fields.includes(k)));

  const output = records.length === 0 && errors.length > 0 ? "" : direction === "json-to-jsonl" ? toJsonl(records) : toJson(records, indent);
  return { ok: true, output, records: records.length, lines, fields, errors };
}
