import { describe, expect, it } from "vitest";
import { SQL_DIALECTS, SQL_EXAMPLES, collapseWhitespace, formatSql, type SqlFormatOptions } from "./sql-format";

const EXAMPLE =
  "SELECT u.id,u.name,o.total FROM users u JOIN orders o ON u.id=o.user_id WHERE o.total>100 AND u.active=1 ORDER BY o.total DESC;";

const defaults: SqlFormatOptions = { dialect: "postgresql", indent: "2", keywordCase: "upper", layout: "expanded" };
const fmt = (text: string, options: Partial<SqlFormatOptions> = {}) => {
  const result = formatSql(text, { ...defaults, ...options });
  if (!result.ok) throw new Error(result.error.message);
  return result.output;
};

describe("formatSql", () => {
  it("expands clauses onto their own indented lines", () => {
    expect(fmt(EXAMPLE)).toBe(
      [
        "SELECT",
        "  u.id,",
        "  u.name,",
        "  o.total",
        "FROM",
        "  users u",
        "  JOIN orders o ON u.id = o.user_id",
        "WHERE",
        "  o.total > 100",
        "  AND u.active = 1",
        "ORDER BY",
        "  o.total DESC;",
      ].join("\n"),
    );
  });

  it("uses the chosen indent", () => {
    expect(fmt("select a from t", { indent: "4" })).toBe("SELECT\n    a\nFROM\n    t");
    expect(fmt("select a from t", { indent: "tab" })).toBe("SELECT\n\ta\nFROM\n\tt");
  });

  it("applies keyword case to keywords, functions and data types but not identifiers", () => {
    expect(fmt("SELECT COUNT(*)::INTEGER AS Total FROM Users", { keywordCase: "lower" })).toBe(
      "select\n  count(*)::integer as Total\nfrom\n  Users",
    );
  });

  it("puts each clause's content beside its keyword when compact", () => {
    expect(fmt("select a, b from t where x in (1, 2, 3)", { layout: "compact" })).toBe(
      "SELECT    a,\n          b\nFROM      t\nWHERE     x IN (1, 2, 3)",
    );
  });

  it("separates statements with a blank line when expanded only", () => {
    expect(fmt("select 1; select 2;")).toBe("SELECT\n  1;\n\nSELECT\n  2;");
    expect(fmt("select 1; select 2;", { layout: "compact" })).toBe("SELECT    1;\nSELECT    2;");
  });

  it("minifies onto a single line", () => {
    expect(fmt(EXAMPLE, { layout: "minify" })).toBe(
      "SELECT u.id,u.name,o.total FROM users u JOIN orders o ON u.id=o.user_id WHERE o.total>100 AND u.active=1 ORDER BY o.total DESC;",
    );
    expect(fmt("select coalesce( a , 0 ) from t where x in ( 1, 2 )", { layout: "minify" })).toBe(
      "SELECT COALESCE(a,0) FROM t WHERE x IN(1,2)",
    );
  });

  it("supports each dialect's own syntax", () => {
    expect(fmt("select [my col] from [t]", { dialect: "transactsql", layout: "minify" })).toBe("SELECT [my col] FROM [t]");
    expect(fmt("select `my col` from t", { dialect: "mysql", layout: "minify" })).toBe("SELECT `my col` FROM t");
    expect(fmt("select a from dual where rownum <= 5", { dialect: "plsql", layout: "minify" })).toBe(
      "SELECT a FROM dual WHERE rownum<=5",
    );
    expect(fmt("select a from t limit 5", { dialect: "sqlite", layout: "minify" })).toBe("SELECT a FROM t LIMIT 5");
  });

  it("reports malformed SQL with its position instead of throwing", () => {
    const result = formatSql("select [a] from t", { ...defaults, dialect: "mysql" });
    expect(result).toEqual({ ok: false, error: { message: 'Unexpected "[a] from t"', line: 1, column: 8 } });

    expect(formatSql("SELECT (a FROM", defaults)).toEqual({
      ok: false,
      error: { message: "Unexpected end of query", line: 1, column: 15 },
    });
    expect(formatSql("select top 5 [a] from [dbo].[t]", defaults)).toEqual({
      ok: false,
      error: { message: 'Unexpected "["', line: 1, column: 29 },
    });
  });

  it("formats the same query differently per dialect", () => {
    const query = "select level from dual connect by level <= 3";
    expect(fmt(query, { dialect: "plsql", layout: "minify" })).toBe("SELECT LEVEL FROM dual CONNECT BY LEVEL<=3");
    expect(fmt(query, { dialect: "postgresql", layout: "minify" })).toBe("SELECT level FROM dual connect by level<=3");
    expect(fmt("select top 5 a from t", { dialect: "transactsql", layout: "minify" })).toBe("SELECT TOP 5 a FROM t");
  });

  it.each(SQL_DIALECTS.map((d) => d.id))("formats the %s example under its own dialect", (dialect) => {
    expect(formatSql(SQL_EXAMPLES[dialect], { ...defaults, dialect }).ok).toBe(true);
  });

  it("reports empty input", () => {
    expect(formatSql("  \n", defaults)).toEqual({ ok: false, error: { message: "Input is empty. Paste some SQL." } });
  });
});

describe("collapseWhitespace", () => {
  it("keeps whitespace inside string literals and quoted identifiers", () => {
    expect(collapseWhitespace("select\n  'a  b\n c',\n  \"x  y\"\nfrom t", "postgresql")).toBe(
      "select 'a  b\n c',\"x  y\" from t",
    );
    expect(collapseWhitespace("select 'it''s  ok', 'x'", "postgresql")).toBe("select 'it''s  ok','x'");
    expect(collapseWhitespace("select 'a\\'  b'", "mysql")).toBe("select 'a\\'  b'");
    expect(collapseWhitespace("select $fn$ a  b $fn$, $$ c  d $$", "postgresql")).toBe("select $fn$ a  b $fn$,$$ c  d $$");
  });

  it("keeps comments, ending a line comment with a newline", () => {
    expect(collapseWhitespace("select\n  a -- note\n  , b\nfrom t", "postgresql")).toBe("select a -- note\n,b from t");
    expect(collapseWhitespace("select a # note\n  from t", "mysql")).toBe("select a # note\nfrom t");
    expect(collapseWhitespace("select /* a  b */\n  c", "postgresql")).toBe("select /* a  b */ c");
  });

  it("doesn't join a unary minus onto a binary one", () => {
    expect(collapseWhitespace("select a- -1", "postgresql")).toBe("select a- -1");
  });
});
