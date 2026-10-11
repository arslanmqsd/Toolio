/**
 * Cleans a CSV file: tidies cells, drops empty and duplicate rows and empty columns, evens out
 * ragged rows and fixes header names. Reads with the JSON ↔ CSV converter's CSV reader.
 */
import { formulaNotice, isFormulaCell, writeCsv, type Delimiter } from "@/lib/csv/write";
import { plural, some, type Notice } from "@/lib/notices";
import {
  PREVIEW_ROWS,
  columnNamer,
  delimiterNames,
  detectDelimiter,
  parseCsv,
  type CsvError,
  type TablePreview,
} from "./json-csv";

export interface CsvCleanOptions {
  delimiter: Delimiter | "auto";
  outputDelimiter: Delimiter | "same";
  header: boolean;
  trim: boolean;
  /** Remove zero-width and control characters, and turn non-breaking spaces into spaces. */
  invisible: boolean;
  collapseSpaces: boolean;
  emptyRows: boolean;
  emptyColumns: boolean;
  duplicates: boolean;
  /** Pad short rows, drop empty fields past the last column, give extra values a column. */
  evenRows: boolean;
  fixHeader: boolean;
  escapeFormulas: boolean;
  crlf: boolean;
}

export const DEFAULT_CSV_CLEAN: CsvCleanOptions = {
  delimiter: "auto",
  outputDelimiter: "same",
  header: true,
  trim: true,
  invisible: true,
  collapseSpaces: false,
  emptyRows: true,
  emptyColumns: true,
  duplicates: false,
  evenRows: true,
  fixHeader: true,
  escapeFormulas: false,
  crlf: false,
};

export interface CsvCleanStats {
  rowsBefore: number;
  rowsAfter: number;
  columnsBefore: number;
  columnsAfter: number;
}

export type CsvCleanResult =
  | { ok: true; output: string; delimiter: Delimiter; table: TablePreview; stats: CsvCleanStats; notices: Notice[]; changed: boolean }
  | { ok: false; error: CsvError };

// Zero-width characters, a byte order mark or soft hyphen inside a cell, and control characters other than tab and line breaks.
const INVISIBLE = /[​-‍⁠﻿­\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// No-break, figure and narrow no-break spaces.
const ODD_SPACE = /[   ]/g;

/** The most fields in any row. A loop, since spreading a million rows into Math.max overflows the stack. */
const widest = (rows: string[][], start = 0) => rows.reduce((max, r) => Math.max(max, r.length), start);

const lineList = (lines: number[]) => `${lines.length === 1 ? "line" : "lines"} ${some(lines.map(String))}`;

export function cleanCsv(text: string, options: CsvCleanOptions): CsvCleanResult {
  const delimiter = options.delimiter === "auto" ? detectDelimiter(text) : options.delimiter;
  const parsed = parseCsv(text, delimiter);
  if (!parsed.ok) return parsed;
  if (parsed.rows.length === 0) return { ok: false, error: { message: "There are no rows to clean.", line: 1, column: 1 } };

  const fixes: Notice[] = [];
  const warnings: Notice[] = [];
  const fixed = (message: string) => fixes.push({ kind: "info", message });
  const warn = (message: string) => warnings.push({ kind: "warning", message });

  // Cells.
  let invisible = 0;
  let collapsed = 0;
  let trimmed = 0;
  const rows = parsed.rows.map((r) =>
    r.map((cell) => {
      let value = cell;
      if (options.invisible) {
        const next = value.replace(INVISIBLE, "").replace(ODD_SPACE, " ");
        if (next !== value) invisible++;
        value = next;
      }
      if (options.collapseSpaces) {
        const next = value.replace(/\s+/g, " ");
        if (next !== value) collapsed++;
        value = next;
      }
      if (options.trim) {
        const next = value.trim();
        if (next !== value) trimmed++;
        value = next;
      }
      return value;
    }),
  );
  if (invisible > 0) fixed(`Removed invisible characters or odd spaces from ${plural(invisible, "cell", "cells")}.`);
  if (collapsed > 0) fixed(`Collapsed runs of spaces and line breaks in ${plural(collapsed, "cell", "cells")}.`);
  if (trimmed > 0) fixed(`Trimmed spaces from ${plural(trimmed, "cell", "cells")}.`);

  let header = options.header ? rows[0] : null;
  let body = options.header ? rows.slice(1) : rows;
  let bodyLines = options.header ? parsed.lines.slice(1) : parsed.lines;
  const rowsBefore = body.length;
  const columnsBefore = header ? header.length : widest(body);

  // Rows. Blank lines never make it out of the parser, so they count as removed here.
  if (options.emptyRows) {
    const keep = body.map((r) => r.some((cell) => cell !== ""));
    const removed = parsed.blankLines + keep.filter((k) => !k).length;
    body = body.filter((_, i) => keep[i]);
    bodyLines = bodyLines.filter((_, i) => keep[i]);
    if (removed > 0) fixed(`Removed ${plural(removed, "empty row", "empty rows")}.`);
  }

  // Columns with no name and no values. Empty fields past the end of the header are ragged rows, not columns.
  if (options.emptyColumns) {
    const width = header ? header.length : widest(body);
    const empty: number[] = [];
    for (let c = 0; c < width; c++) {
      if ((header?.[c] ?? "") === "" && body.every((r) => (r[c] ?? "") === "")) empty.push(c);
    }
    if (empty.length > 0) {
      const drop = new Set(empty);
      const keepColumns = (r: string[]) => r.filter((_, c) => !drop.has(c));
      if (header) header = keepColumns(header);
      body = body.map(keepColumns);
      fixed(`Removed ${plural(empty.length, "empty column", "empty columns")} (${empty.length === 1 ? "column" : "columns"} ${some(empty.map((c) => String(c + 1)))}).`);
    }
  }

  // Ragged rows, measured against the header, or the widest row when there isn't one.
  const width = header ? header.length : widest(body);
  const short: number[] = [];
  const extra: string[] = [];
  const uneven: string[] = [];
  let trailing = 0;
  body = body.map((r, i) => {
    if (r.length === width) return r;
    const described = `line ${bodyLines[i]} has ${plural(r.length, "field", "fields")}`;
    uneven.push(described);
    if (r.length < width) {
      short.push(bodyLines[i]);
      return options.evenRows ? [...r, ...Array<string>(width - r.length).fill("")] : r;
    }
    let end = r.length;
    while (end > width && r[end - 1] === "") end--;
    if (end === width) trailing++;
    else extra.push(described);
    return options.evenRows ? r.slice(0, end) : r;
  });
  const sentence = (list: string[]) => `${some(list)[0].toUpperCase()}${some(list).slice(1)}; ${header ? "the header" : "the widest row"} has ${width}.`;
  if (!options.evenRows) {
    if (uneven.length > 0) warn(`${sentence(uneven)} A row with too many fields often has a delimiter in a value that isn't quoted.`);
  } else {
    if (short.length > 0) fixed(`Filled out ${plural(short.length, "short row", "short rows")} with empty fields (${lineList(short)}).`);
    if (trailing > 0) fixed(`Dropped empty fields past the last column on ${plural(trailing, "row", "rows")}.`);
    if (extra.length > 0) {
      warn(`${sentence(extra)} The extra values get a column of their own, so check they belong there. A value with an unquoted delimiter in it splits like this.`);
      header = header && [...header, ...Array<string>(widest(body) - header.length).fill("")];
    }
  }

  // Header names.
  if (header && options.fixHeader) {
    const named = columnNamer(header);
    if (named.names.some((name, i) => name !== header![i])) {
      fixes.push(...named.notices("info"));
      header = named.names;
    }
  }

  // Duplicates, last so cells that only differed by spaces count as the same.
  if (options.duplicates) {
    const seen = new Set<string>();
    const repeats: number[] = [];
    const keep = body.map((r, i) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) {
        repeats.push(bodyLines[i]);
        return false;
      }
      seen.add(key);
      return true;
    });
    body = body.filter((_, i) => keep[i]);
    if (repeats.length > 0) fixed(`Removed ${plural(repeats.length, "duplicate row", "duplicate rows")} (${lineList(repeats)}), keeping the first of each.`);
  }

  // Things the cleaner can't fix.
  let formulas = 0;
  let replacement = 0;
  const all = header ? [header, ...body] : body;
  const written = all.map((r) =>
    r.map((cell) => {
      if (cell.includes("�")) replacement++;
      if (!isFormulaCell(cell)) return cell;
      formulas++;
      return options.escapeFormulas ? `'${cell}` : cell;
    }),
  );
  if (replacement > 0) {
    warn(`${plural(replacement, "cell has", "cells have")} � in ${replacement === 1 ? "it" : "them"}, where a character was lost. The file was probably saved in another encoding than UTF-8; save it as UTF-8 and load it again.`);
  }
  if (formulas > 0) (options.escapeFormulas ? fixes : warnings).push(formulaNotice(formulas, options.escapeFormulas));

  const out = options.outputDelimiter === "same" ? delimiter : options.outputDelimiter;
  if (out !== delimiter) fixed(`Changed the delimiter from ${delimiterNames[delimiter].toLowerCase()} to ${delimiterNames[out].toLowerCase()}.`);

  const writtenBody = header ? written.slice(1) : written;
  const columnsAfter = widest(writtenBody, header?.length ?? 0);
  return {
    ok: true,
    output: writeCsv(written, out, options.crlf),
    delimiter,
    table: { header: header && written[0], rows: writtenBody.slice(0, PREVIEW_ROWS), rowCount: writtenBody.length, columnCount: columnsAfter },
    stats: { rowsBefore, rowsAfter: writtenBody.length, columnsBefore, columnsAfter },
    notices: [...warnings, ...fixes],
    changed: fixes.length > 0,
  };
}

export interface CsvCleanRequest {
  text: string;
  options: CsvCleanOptions;
}
