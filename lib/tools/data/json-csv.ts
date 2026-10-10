/**
 * JSON ↔ CSV. The CSV reader is written for this tool so errors can point at a line and column,
 * which a row number can't do once a quoted field spans lines. JSON is read with the JSON
 * Formatter's parser and written from its tree, so numbers keep their digits both ways.
 */
import { parseJson, printJson, type JsonNode } from "@/lib/tools/developer/json-format";

export type Delimiter = "," | ";" | "\t" | "|";

export const DELIMITERS: Delimiter[] = [",", ";", "\t", "|"];

export const delimiterNames: Record<Delimiter, string> = { ",": "Comma", ";": "Semicolon", "\t": "Tab", "|": "Pipe" };

export interface CsvError {
  message: string;
  line: number;
  column: number;
}

export interface Notice {
  /** Warnings may mean lost or misread data; info only says what was done. */
  kind: "warning" | "info";
  message: string;
}

/** The first rows of the table, for a preview. */
export interface TablePreview {
  header: string[] | null;
  rows: string[][];
  rowCount: number;
  columnCount: number;
}

export const PREVIEW_ROWS = 100;

export type CsvParseResult = { ok: true; rows: string[][]; lines: number[]; blankLines: number } | { ok: false; error: CsvError };

function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  return { line: before.split("\n").length, column: offset - (before.lastIndexOf("\n") + 1) + 1 };
}

/** RFC 4180, leniently: any line ending, and a quote inside an unquoted field is kept as text. */
export function parseCsv(text: string, delimiter: Delimiter): CsvParseResult {
  const src = text.replace(/^﻿/, "");
  const n = src.length;
  const rows: string[][] = [];
  const starts: number[] = [];
  let blankLines = 0;
  let row: string[] = [];
  let rowStart = 0;
  let quotedInRow = false;
  let i = 0;
  const fail = (message: string, offset: number): CsvParseResult => ({ ok: false, error: { message, ...position(src, offset) } });

  if (n === 0) return { ok: true, rows, lines: [], blankLines };
  for (;;) {
    if (src[i] === '"') {
      const open = i;
      quotedInRow = true;
      let value = "";
      i++;
      for (;;) {
        const quote = src.indexOf('"', i);
        if (quote < 0) return fail('This quoted field is never closed. A " inside a quoted field is written "".', open);
        value += src.slice(i, quote);
        if (src[quote + 1] === '"') {
          value += '"';
          i = quote + 2;
        } else {
          i = quote + 1;
          break;
        }
      }
      if (i < n && src[i] !== delimiter && src[i] !== "\n" && src[i] !== "\r") {
        return fail(`Expected ${delimiterNames[delimiter].toLowerCase()} or a new line after the closing quote. A " inside a quoted field is written "".`, i);
      }
      row.push(value);
    } else {
      let end = i;
      while (end < n && src[end] !== delimiter && src[end] !== "\n" && src[end] !== "\r") end++;
      row.push(src.slice(i, end));
      i = end;
    }

    if (i < n && src[i] === delimiter) {
      i++;
      continue;
    }
    // The end of a row: an empty unquoted line is skipped rather than read as a row with one empty field.
    if (row.length === 1 && row[0] === "" && !quotedInRow) {
      if (i < n) blankLines++;
    } else {
      rows.push(row);
      starts.push(rowStart);
    }
    if (i >= n) break;
    i += src[i] === "\r" && src[i + 1] === "\n" ? 2 : 1;
    if (i >= n) break;
    row = [];
    rowStart = i;
    quotedInRow = false;
  }

  // Row start offsets to line numbers, in one pass since they only go up.
  const lines: number[] = [];
  let line = 1;
  let at = 0;
  for (const start of starts) {
    for (let nl = src.indexOf("\n", at); nl >= 0 && nl < start; nl = src.indexOf("\n", nl + 1)) {
      line++;
      at = nl + 1;
    }
    lines.push(line);
  }
  return { ok: true, rows, lines, blankLines };
}

const SAMPLE_CHARS = 64 * 1024;
const SAMPLE_ROWS = 50;

/** The delimiter that splits the first rows into the same number of fields most often, comma if none does. */
export function detectDelimiter(text: string): Delimiter {
  let sample = text.slice(0, SAMPLE_CHARS);
  if (text.length > SAMPLE_CHARS && sample.lastIndexOf("\n") > 0) sample = sample.slice(0, sample.lastIndexOf("\n"));
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const delimiter of DELIMITERS) {
    const parsed = parseCsv(sample, delimiter);
    if (!parsed.ok || parsed.rows.length === 0) continue;
    const counts = new Map<number, number>();
    for (const r of parsed.rows.slice(0, SAMPLE_ROWS)) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    const [fields, rowsWithIt] = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (fields < 2) continue;
    const score = (rowsWithIt / Math.min(parsed.rows.length, SAMPLE_ROWS)) * 1000 + fields;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

/** Lists a few examples and how many more there are: "a, b, c and 4 more". */
function some(items: string[], shown = 3): string {
  const listed = items.slice(0, shown);
  const rest = items.length - listed.length;
  if (rest > 0) return `${listed.join(", ")} and ${rest} more`;
  return listed.length > 1 ? `${listed.slice(0, -1).join(", ")} and ${listed[listed.length - 1]}` : listed[0];
}

/** The most fields in any row. A loop, since spreading a million rows into Math.max overflows the stack. */
const widest = (rows: string[][], start = 0) => rows.reduce((max, r) => Math.max(max, r.length), start);

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export interface CsvToJsonOptions {
  delimiter: Delimiter | "auto";
  /** The first row names the columns: each row becomes an object. Otherwise each row is an array. */
  header: boolean;
  /** Numbers, true/false and null become JSON values; everything else stays a string. */
  inferTypes: boolean;
  emptyAsNull: boolean;
  /** owner.name headers become nested objects, tags.0 headers arrays. */
  nest: boolean;
  /** "" for one line. */
  indent: string;
}

export const DEFAULT_CSV_TO_JSON: CsvToJsonOptions = { delimiter: "auto", header: true, inferTypes: true, emptyAsNull: false, nest: false, indent: "  " };

export type CsvToJsonResult = { ok: true; output: string; delimiter: Delimiter; table: TablePreview; notices: Notice[] } | { ok: false; error: CsvError };

// Leading zeros, a leading +, exponents and thousands separators stay strings: 007, +1, 1e5 and
// 1,000 are usually codes or text, and a spreadsheet would have written a plain number otherwise.
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

const stringNode = (value: string): JsonNode => ({ type: "string", raw: JSON.stringify(value) });

/** A tree of nested headers. Maps, so a header like __proto__ is just a key. */
type Tree = Map<string, Tree | JsonNode>;

function treeToNode(tree: Tree, nested: boolean): JsonNode {
  const keys = [...tree.keys()];
  const values = [...tree.values()].map((v) => (v instanceof Map ? treeToNode(v, true) : v));
  // Numbered keys under a header (tags.0, tags.1) were an array.
  if (nested && keys.every((k, i) => k === String(i))) return { type: "array", items: values };
  return { type: "object", entries: keys.map((key, i) => ({ key, rawKey: JSON.stringify(key), value: values[i] })) };
}

export function csvToJson(text: string, options: CsvToJsonOptions): CsvToJsonResult {
  const delimiter = options.delimiter === "auto" ? detectDelimiter(text) : options.delimiter;
  const parsed = parseCsv(text, delimiter);
  if (!parsed.ok) return parsed;
  if (parsed.rows.length === 0) return { ok: false, error: { message: "There are no rows to convert.", line: 1, column: 1 } };

  const notices: Notice[] = [];
  const bigNumbers: string[] = [];
  const value = (cell: string | undefined): JsonNode => {
    if (cell === undefined || cell === "") return options.emptyAsNull ? { type: "null", raw: "null" } : stringNode("");
    if (!options.inferTypes) return stringNode(cell);
    if (/^(true|false)$/i.test(cell)) return { type: "boolean", raw: cell.toLowerCase() as "true" | "false" };
    if (/^null$/i.test(cell)) return { type: "null", raw: "null" };
    if (NUMBER.test(cell)) {
      if (cell.includes(".") || Number.isSafeInteger(Number(cell))) return { type: "number", raw: cell };
      bigNumbers.push(cell);
    }
    return stringNode(cell);
  };

  const header = options.header ? parsed.rows[0] : null;
  const dataRows = options.header ? parsed.rows.slice(1) : parsed.rows;
  const dataLines = options.header ? parsed.lines.slice(1) : parsed.lines;
  let output: string;

  if (!header) {
    const items = dataRows.map((r): JsonNode => ({ type: "array", items: r.map(value) }));
    output = printJson({ type: "array", items }, { indent: options.indent, sortKeys: false });
  } else {
    const names: string[] = [];
    const used = new Set<string>();
    const repeated = new Set<string>();
    const nameColumn = (wanted: string, index: number) => {
      let name = wanted === "" ? `column_${index + 1}` : wanted;
      if (used.has(name)) {
        repeated.add(name);
        let k = 2;
        while (used.has(`${name}_${k}`)) k++;
        name = `${name}_${k}`;
      }
      used.add(name);
      names.push(name);
    };
    header.forEach((h, i) => nameColumn(h, i));
    const unnamed = header.filter((h) => h === "").length;
    if (repeated.size > 0) notices.push({ kind: "warning", message: `${some([...repeated])} ${repeated.size === 1 ? "appears" : "appear"} more than once in the header, so the repeats get _2, _3 and so on.` });
    if (unnamed > 0) notices.push({ kind: "info", message: `${plural(unnamed, "column has", "columns have")} no name in the header, so ${unnamed === 1 ? "it's" : "they're"} named by position, like column_${header.indexOf("") + 1}.` });

    const ragged: string[] = [];
    dataRows.forEach((r, i) => {
      if (r.length !== header.length) ragged.push(`line ${dataLines[i]} has ${plural(r.length, "field", "fields")}`);
      while (names.length < r.length) nameColumn("", names.length);
    });
    if (ragged.length > 0) {
      const text = some(ragged);
      notices.push({ kind: "warning", message: `${text[0].toUpperCase()}${text.slice(1)}; the header has ${header.length}. Missing fields are left empty and extra ones get a column of their own.` });
    }

    // Nest only when every header splits cleanly and none is both a value and a parent (a and a.b).
    let paths: string[][] | null = null;
    if (options.nest) {
      paths = names.map((name) => (name.split(".").every((part) => part !== "") ? name.split(".") : [name]));
      const leaves = new Set(paths.map((p) => p.join("\u0000")));
      const clash = paths.find((p) => p.some((_, i) => i > 0 && leaves.has(p.slice(0, i).join("\u0000"))));
      if (clash) {
        const parent = names[paths.findIndex((p) => clash.join(".").startsWith(`${p.join(".")}.`))];
        notices.push({ kind: "warning", message: `Headers ${parent} and ${clash.join(".")} clash, so nothing was nested.` });
        paths = null;
      }
    }

    const items = dataRows.map((r): JsonNode => {
      if (!paths) {
        const entries = names.slice(0, Math.max(header.length, r.length)).map((key, i) => ({ key, rawKey: JSON.stringify(key), value: value(r[i]) }));
        return { type: "object", entries };
      }
      const tree: Tree = new Map();
      paths.slice(0, Math.max(header.length, r.length)).forEach((path, i) => {
        let node = tree;
        for (const part of path.slice(0, -1)) {
          let next = node.get(part);
          if (!(next instanceof Map)) node.set(part, (next = new Map()));
          node = next;
        }
        node.set(path[path.length - 1], value(r[i]));
      });
      return treeToNode(tree, false);
    });
    output = printJson({ type: "array", items }, { indent: options.indent, sortKeys: false });
  }

  if (bigNumbers.length > 0) {
    const one = bigNumbers.length === 1;
    notices.push({ kind: "info", message: `${some(bigNumbers)} ${one ? "is" : "are"} too large for JavaScript to read exactly, so ${one ? "it's kept as a string" : "they're kept as strings"}.` });
  }
  if (parsed.blankLines > 0) notices.push({ kind: "info", message: `Skipped ${plural(parsed.blankLines, "blank line", "blank lines")}.` });

  const width = widest(dataRows, header?.length ?? 0);
  return {
    ok: true,
    output,
    delimiter,
    table: { header, rows: dataRows.slice(0, PREVIEW_ROWS), rowCount: dataRows.length, columnCount: width },
    notices,
  };
}

export interface JsonToCsvOptions {
  delimiter: Delimiter;
  /** "json" writes an array into one cell as JSON; "columns" gives each item a column (tags.0, tags.1). */
  arrays: "json" | "columns";
  crlf: boolean;
  /** Prefix cells a spreadsheet would run as a formula with ', so they open as text. */
  escapeFormulas: boolean;
}

export const DEFAULT_JSON_TO_CSV: JsonToCsvOptions = { delimiter: ",", arrays: "json", crlf: false, escapeFormulas: false };

export type JsonToCsvResult = { ok: true; output: string; table: TablePreview; notices: Notice[] } | { ok: false; error: CsvError };

// What Excel, LibreOffice and Google Sheets treat as the start of a formula. A plain number like
// -5 or +1.5 starts the same way but is only a number.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function cellText(node: JsonNode): string {
  if (node.type === "string") return JSON.parse(node.raw) as string;
  if (node.type === "null") return "";
  if (node.type === "object" || node.type === "array") return printJson(node, { indent: "", sortKeys: false });
  return node.raw;
}

function writeCsv(rows: string[][], delimiter: Delimiter, crlf: boolean): string {
  const newline = crlf ? "\r\n" : "\n";
  const field = (cell: string) => (cell.includes(delimiter) || /["\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return rows.map((r) => r.map(field).join(delimiter) + newline).join("");
}

export function jsonToCsv(text: string, options: JsonToCsvOptions): JsonToCsvResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, error: { message: parsed.error.message, line: parsed.error.line, column: parsed.error.column } };
  const root = parsed.value;
  const notices: Notice[] = [];
  if (parsed.stats.duplicateKeys.length > 0) {
    notices.push({ kind: "warning", message: `Duplicate keys (${some([...new Set(parsed.stats.duplicateKeys)])}): only the last value of each is kept.` });
  }

  let header: string[] | null;
  let body: string[][];
  const records = root.type === "array" ? root.items : root.type === "object" ? [root] : null;
  if (!records) return { ok: false, error: { message: `Expected an array of objects, or one object, but this is ${root.type === "null" ? "null" : `a ${root.type}`}.`, line: 1, column: 1 } };

  if (records.length > 0 && records.every((r) => r.type === "array")) {
    // Rows given as arrays are written as they are, the first one usually being the header.
    header = null;
    body = records.map((r) => (r.type === "array" ? r.items.map(cellText) : []));
  } else {
    // An object whose values are all objects is a set of records keyed by id: { "u1": {…}, "u2": {…} }.
    let rows: { key?: string; node: JsonNode }[] = records.map((node) => ({ node }));
    if (root.type === "object" && root.entries.length > 0 && root.entries.every((e) => e.value.type === "object")) {
      rows = root.entries.map((e) => ({ key: e.key, node: e.value }));
    }

    const columns = new Map<string, number>();
    const sources = new Map<string, string>();
    const collided = new Set<string>();
    const column = (path: string[]) => {
      const name = path.length === 0 ? "value" : path.join(".");
      const source = JSON.stringify(path);
      if (!sources.has(name)) sources.set(name, source);
      else if (sources.get(name) !== source) collided.add(name);
      if (!columns.has(name)) columns.set(name, columns.size);
      return name;
    };
    if (rows.some((r) => r.key !== undefined)) column(["key"]);

    const flat = rows.map(({ key, node }) => {
      const cells = new Map<string, string>();
      if (key !== undefined) cells.set("key", key);
      const visit = (n: JsonNode, path: string[]) => {
        if (n.type === "object" && n.entries.length > 0) n.entries.forEach((e) => visit(e.value, [...path, e.key]));
        else if (n.type === "array" && n.items.length > 0 && options.arrays === "columns" && path.length > 0) n.items.forEach((item, i) => visit(item, [...path, String(i)]));
        else cells.set(column(path), cellText(n));
      };
      visit(node, []);
      return cells;
    });
    if (collided.size > 0) notices.push({ kind: "warning", message: `${some([...collided])}: different keys flatten to the same column name, so only one value is kept.` });

    header = [...columns.keys()];
    body = flat.map((cells) => header!.map((name) => cells.get(name) ?? ""));
  }

  let formulas = 0;
  const escape = (r: string[]) =>
    r.map((cell) => {
      if (!FORMULA_START.test(cell) || PLAIN_NUMBER.test(cell)) return cell;
      formulas++;
      return options.escapeFormulas ? `'${cell}` : cell;
    });
  const written = [...(header ? [header] : []), ...body].map(escape);
  const writtenBody = header ? written.slice(1) : written;
  if (formulas > 0) {
    notices.push(
      options.escapeFormulas
        ? { kind: "info", message: `${plural(formulas, "cell starts", "cells start")} with ', so a spreadsheet opens ${formulas === 1 ? "it" : "them"} as text rather than running a formula.` }
        : {
            kind: "warning",
            message: `${plural(formulas, "cell starts", "cells start")} with =, +, -, @ or a tab, so Excel or Sheets would run ${formulas === 1 ? "it" : "them"} as a formula. If this data came from someone else, turn on escaping before opening it in a spreadsheet.`,
          },
    );
  }

  return {
    ok: true,
    output: writeCsv(written, options.delimiter, options.crlf),
    table: { header: header && written[0], rows: writtenBody.slice(0, PREVIEW_ROWS), rowCount: writtenBody.length, columnCount: widest(writtenBody, header?.length ?? 0) },
    notices,
  };
}

export type JsonCsvRequest = { text: string } & ({ direction: "csv-to-json"; options: CsvToJsonOptions } | { direction: "json-to-csv"; options: JsonToCsvOptions });

export type JsonCsvJobResult = { direction: JsonCsvRequest["direction"] } & (CsvToJsonResult | JsonToCsvResult);

export function convertJsonCsv(request: JsonCsvRequest): JsonCsvJobResult {
  const result = request.direction === "csv-to-json" ? csvToJson(request.text, request.options) : jsonToCsv(request.text, request.options);
  return { ...result, direction: request.direction };
}
