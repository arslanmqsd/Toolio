import { formatDialect, mysql, plsql, postgresql, sqlite, transactsql, type FormatOptions } from "sql-formatter";

export const SQL_DIALECTS = [
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "sqlite", label: "SQLite" },
  { id: "transactsql", label: "SQL Server" },
  { id: "plsql", label: "Oracle" },
] as const;

export type SqlDialect = (typeof SQL_DIALECTS)[number]["id"];

/** A messy query per dialect, each using syntax only that dialect (or a close relative) accepts. */
export const SQL_EXAMPLES: Record<SqlDialect, string> = {
  postgresql: `SELECT u.id,u.name,o.total::numeric(10,2) AS total,o.meta->>'channel' AS channel FROM users u JOIN orders o ON u.id=o.user_id
WHERE o.total>100 AND u.active ORDER BY o.total DESC LIMIT 10;`,
  mysql: `SELECT u.id,u.\`name\`,o.total,IFNULL(o.coupon,'none') AS coupon FROM users u JOIN orders o ON u.id=o.user_id
WHERE o.total>100 AND u.active=1 ORDER BY o.total DESC LIMIT 10;`,
  sqlite: `SELECT u.id,u.name,o.total,strftime('%Y-%m',o.created_at) AS month FROM users u JOIN orders o ON u.id=o.user_id
WHERE o.total>100 AND u.active=1 ORDER BY o.total DESC LIMIT 10;`,
  transactsql: `SELECT TOP 10 u.id,u.[name],o.total,ISNULL(o.coupon,'none') AS coupon FROM dbo.users u JOIN dbo.orders o ON u.id=o.user_id
WHERE o.total>100 AND u.active=1 ORDER BY o.total DESC;`,
  plsql: `SELECT u.id,u.name,o.total,NVL(o.coupon,'none') AS coupon FROM users u JOIN orders o ON u.id=o.user_id
WHERE o.total>100 AND u.active=1 ORDER BY o.total DESC FETCH FIRST 10 ROWS ONLY;`,
};

// Importing each dialect by name, not `format({ language })`, keeps the other dialects out of the bundle.
const dialects = { postgresql, mysql, sqlite, transactsql, plsql };

export type SqlIndent = "2" | "4" | "tab";
/** "compact" is sql-formatter's tabularLeft style; "minify" collapses its output onto one line. */
export type SqlLayout = "expanded" | "compact" | "minify";

export interface SqlFormatOptions {
  dialect: SqlDialect;
  indent: SqlIndent;
  keywordCase: "upper" | "lower";
  layout: SqlLayout;
}

export type SqlFormatResult =
  | { ok: true; output: string }
  | { ok: false; error: { message: string; line?: number; column?: number } };

export function formatSql(input: string, options: SqlFormatOptions): SqlFormatResult {
  if (input.trim() === "") return { ok: false, error: { message: "Input is empty. Paste some SQL." } };

  const { dialect, indent, keywordCase, layout } = options;
  const config: Partial<FormatOptions> = {
    tabWidth: indent === "4" ? 4 : 2,
    useTabs: indent === "tab",
    // Functions and data types are keywords to most readers, so they follow the same case.
    keywordCase,
    functionCase: keywordCase,
    dataTypeCase: keywordCase,
    indentStyle: layout === "compact" ? "tabularLeft" : "standard",
    // Keep short parenthesised lists like IN (1, 2, 3) on one line when compact.
    expressionWidth: layout === "expanded" ? 50 : 80,
    linesBetweenQueries: layout === "expanded" ? 1 : 0,
    denseOperators: layout === "minify",
  };

  try {
    const output = formatDialect(input, { dialect: dialects[dialect], ...config });
    return { ok: true, output: layout === "minify" ? collapseWhitespace(output, dialect) : output };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** sql-formatter's parse errors run to dozens of lines of grammar trace; the first line says what went wrong. */
function describeError(error: unknown): { message: string; line?: number; column?: number } {
  const raw = error instanceof Error ? error.message : String(error);
  // Lexer errors read `Parse error: Unexpected "…"`, parser errors `Parse error at token: …` («EOF» at the end).
  const first = raw
    .split("\n")[0]
    .replace(/^Parse error:\s*/, "")
    .replace(/^Parse error at token:\s*«EOF»/, "Unexpected end of query")
    .replace(/^Parse error at token:\s*(.*?)(?= at line|$)/, 'Unexpected "$1"');
  const position = /at line (\d+) column (\d+)/.exec(first);
  const message = first.replace(/\s*at line \d+ column \d+\.?/, "").trim();
  return position ? { message, line: Number(position[1]), column: Number(position[2]) } : { message };
}

// No space after these or before those; a space stays after ")" so ") FROM" doesn't read as one word.
const TIGHT_AFTER = new Set(["(", ",", ";"]);
const TIGHT_BEFORE = new Set(["(", ")", ",", ";"]);

/**
 * Puts formatted SQL on one line: whitespace runs become one space, or none where punctuation makes it redundant.
 * String literals, quoted identifiers and comments are copied as-is; a line comment keeps the
 * newline that ends it, since anything after it on the same line would be commented out.
 */
export function collapseWhitespace(sql: string, dialect: SqlDialect): string {
  let out = "";
  let pendingSpace = false;
  let i = 0;

  const emit = (text: string) => {
    const last = out[out.length - 1];
    if (pendingSpace && last !== undefined && last !== "\n" && !TIGHT_AFTER.has(last) && !TIGHT_BEFORE.has(text[0])) out += " ";
    pendingSpace = false;
    out += text;
  };

  /** Index just past a literal that closes with `close`, honouring a doubled close as an escape. */
  const skipQuoted = (start: number, close: string) => {
    let j = start + 1;
    while (j < sql.length) {
      if (dialect === "mysql" && sql[j] === "\\") j += 2;
      else if (sql[j] === close) {
        if (sql[j + 1] === close) j += 2;
        else return j + 1;
      } else j++;
    }
    return sql.length;
  };

  while (i < sql.length) {
    const ch = sql[i];
    let end = -1;

    if (/\s/.test(ch)) {
      pendingSpace = true;
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") end = skipQuoted(i, ch);
    else if (ch === "[" && dialect === "transactsql") end = skipQuoted(i, "]");
    else if (ch === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      end = close === -1 ? sql.length : close + 2;
    } else if ((ch === "-" && sql[i + 1] === "-") || (ch === "#" && dialect === "mysql")) {
      const newline = sql.indexOf("\n", i);
      end = newline === -1 ? sql.length : newline;
      emit(sql.slice(i, end));
      out += "\n";
      i = end + 1;
      continue;
    } else if (ch === "$" && dialect === "postgresql") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        end = close === -1 ? sql.length : close + tag.length;
      }
    }

    if (end === -1) end = i + 1;
    emit(sql.slice(i, end));
    i = end;
  }

  return out.trimEnd();
}
