/**
 * Writing CSV, and keeping it safe to open in a spreadsheet. Shared by every tool that outputs CSV.
 */
import { plural, type Notice } from "@/lib/notices";

export type Delimiter = "," | ";" | "\t" | "|";

/** Quotes only the fields that need it. */
export function writeCsv(rows: string[][], delimiter: Delimiter, crlf: boolean): string {
  const newline = crlf ? "\r\n" : "\n";
  const field = (cell: string) => (cell.includes(delimiter) || /["\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return rows.map((r) => r.map(field).join(delimiter) + newline).join("");
}

// What Excel, LibreOffice and Google Sheets treat as the start of a formula. A plain number like
// -5 or +1.5 starts the same way but is only a number.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Whether a spreadsheet would run this cell as a formula. */
export const isFormulaCell = (cell: string) => FORMULA_START.test(cell) && !PLAIN_NUMBER.test(cell);

/** What to say about cells that start like a formula: escaped with ', or a warning that they would run. */
export function formulaNotice(count: number, escaped: boolean): Notice {
  return escaped
    ? { kind: "info", message: `${plural(count, "cell starts", "cells start")} with ', so a spreadsheet opens ${count === 1 ? "it" : "them"} as text rather than running a formula.` }
    : {
        kind: "warning",
        message: `${plural(count, "cell starts", "cells start")} with =, +, -, @ or a tab, so Excel or Sheets would run ${count === 1 ? "it" : "them"} as a formula. If this data came from someone else, turn on escaping before opening it in a spreadsheet.`,
      };
}
