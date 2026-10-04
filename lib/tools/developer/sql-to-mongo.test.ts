import { describe, expect, it } from "vitest";
import { convertSqlToMongo, type MongoSqlDialect } from "./sql-to-mongo";

const convert = (sql: string, dialect: MongoSqlDialect = "mysql") => {
  const result = convertSqlToMongo(sql, dialect);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
const output = (sql: string, dialect?: MongoSqlDialect) => convert(sql, dialect).output;
/** The constructs named in notes of this level. */
const notes = (sql: string, level: "unsupported" | "caveat", dialect?: MongoSqlDialect) =>
  convert(sql, dialect).notes.filter((n) => n.level === level).map((n) => n.construct);

describe("convertSqlToMongo", () => {
  it("converts the example to find, sort and limit", () => {
    const sql = "SELECT name, email FROM users WHERE age > 25 AND active = true\nORDER BY name ASC LIMIT 10;";
    const expected = [
      "db.users",
      "  .find({ age: { $gt: 25 }, active: true }, { name: 1, email: 1, _id: 0 })",
      "  .sort({ name: 1 })",
      "  .limit(10)",
    ].join("\n");
    expect(output(sql, "mysql")).toBe(expected);
    expect(output(sql, "postgresql")).toBe(expected);
  });

  it("keeps everything on one line when it fits", () => {
    expect(output("select * from t")).toBe("db.t.find()");
    expect(output("select a from t")).toBe("db.t.find({}, { a: 1, _id: 0 })");
    expect(output("select _id, a from t where b = 'x'")).toBe('db.t.find({ b: "x" }, { _id: 1, a: 1 })');
  });

  it("maps comparisons, IN, BETWEEN and NULL checks", () => {
    expect(output("select * from t where a >= 1 and b < 2 and c <= 3 and d != 4 and e <> 5")).toBe(
      ["db.t", "  .find({", "    a: { $gte: 1 },", "    b: { $lt: 2 },", "    c: { $lte: 3 },", "    d: { $ne: 4 },", "    e: { $ne: 5 }", "  })"].join("\n"),
    );
    expect(output("select * from t where a in (1, 'x') and b not in (2)")).toBe('db.t.find({ a: { $in: [1, "x"] }, b: { $nin: [2] } })');
    expect(output("select * from t where a between 1 and 5")).toBe("db.t.find({ a: { $gte: 1, $lte: 5 } })");
    expect(output("select * from t where a is null and b is not null")).toBe("db.t.find({ a: null, b: { $ne: null } })");
    expect(output("select * from t where 25 < age")).toBe("db.t.find({ age: { $gt: 25 } })");
  });

  it("uses $or, and $and only when ANDed conditions clash", () => {
    expect(output("select * from t where a = 1 or b = 2")).toBe("db.t.find({ $or: [{ a: 1 }, { b: 2 }] })");
    expect(output("select * from t where a > 1 and a < 9")).toBe("db.t.find({ a: { $gt: 1, $lt: 9 } })");
    expect(output("select * from t where a = 1 and a = 2")).toBe("db.t.find({ $and: [{ a: 1 }, { a: 2 }] })");
    expect(output("select * from t where (a = 1 or b = 2) and (c = 3 or d = 4)")).toBe(
      "db.t\n  .find({ $and: [{ $or: [{ a: 1 }, { b: 2 }] }, { $or: [{ c: 3 }, { d: 4 }] }] })",
    );
  });

  it("negates with NOT", () => {
    expect(output("select * from t where not a = 1")).toBe("db.t.find({ a: { $ne: 1 } })");
    expect(output("select * from t where not (a is null)")).toBe("db.t.find({ a: { $ne: null } })");
    expect(output("select * from t where a not between 1 and 3")).toBe("db.t.find({ a: { $not: { $gte: 1, $lte: 3 } } })");
    expect(output("select * from t where not (a = 1 or b = 2)")).toBe("db.t.find({ $nor: [{ a: 1 }, { b: 2 }] })");
  });

  it("turns LIKE into an anchored regex", () => {
    const like = (pattern: string, dialect: MongoSqlDialect = "postgresql") =>
      output(`select * from t where a like '${pattern}'`, dialect);
    expect(like("Ada%")).toBe('db.t.find({ a: { $regex: "^Ada" } })');
    expect(like("%son")).toBe('db.t.find({ a: { $regex: "son$" } })');
    expect(like("%a_b%")).toBe('db.t.find({ a: { $regex: "a.b", $options: "s" } })');
    expect(like("a.b%c")).toBe('db.t.find({ a: { $regex: "^a\\\\.b.*c$", $options: "s" } })');
    expect(like("100\\%")).toBe('db.t.find({ a: { $regex: "^100%$" } })');
    expect(output("select * from t where a like 'x!%' escape '!'", "postgresql")).toBe('db.t.find({ a: { $regex: "^x%$" } })');
    expect(output("select * from t where a ilike 'ada%'", "postgresql")).toBe('db.t.find({ a: { $regex: "^ada", $options: "i" } })');
    expect(output("select * from t where a not like 'x%'", "postgresql")).toBe('db.t.find({ a: { $not: { $regex: "^x" } } })');
  });

  it("matches MySQL's case-insensitive LIKE and says so", () => {
    expect(output("select * from t where a like 'ada%'")).toBe('db.t.find({ a: { $regex: "^ada", $options: "i" } })');
    expect(notes("select * from t where a like 'ada%'", "caveat")).toEqual(["LIKE case"]);
  });

  it("unescapes string literals per dialect", () => {
    expect(output("select * from t where a = 'it''s'", "postgresql")).toBe(`db.t.find({ a: "it's" })`);
    expect(output("select * from t where a = 'C:\\dir'", "postgresql")).toBe('db.t.find({ a: "C:\\\\dir" })');
    expect(output("select * from t where a = 'it\\'s\\n'")).toBe('db.t.find({ a: "it\'s\\n" })');
    expect(output('select * from t where a = "x"')).toBe('db.t.find({ a: "x" })');
  });

  it("keeps integers too large for a double exact", () => {
    expect(output("select * from t where id = 9007199254740993")).toBe('db.t.find({ id: NumberLong("9007199254740993") })');
  });

  it("maps ORDER BY, LIMIT and OFFSET in both dialects' forms", () => {
    expect(output("select * from t order by a desc, b limit 5 offset 10")).toBe("db.t.find().sort({ a: -1, b: 1 }).skip(10).limit(5)");
    expect(output("select * from t limit 10, 5")).toBe("db.t.find().skip(10).limit(5)");
    expect(output("select * from t offset 3", "postgresql")).toBe("db.t.find().skip(3)");
    expect(output("select * from t limit all", "postgresql")).toBe("db.t.find()");
  });

  it("renames aliased columns and sorts on the real field", () => {
    expect(output("select a as b from t order by b")).toBe('db.t.find({}, { b: "$a", _id: 0 }).sort({ a: 1 })');
    expect(notes("select a as b from t", "caveat")).toEqual(["Column alias"]);
  });

  it("strips the table name or alias from qualified columns", () => {
    expect(output("select u.name from users u where users.age > 1 and u.id = 2")).toBe(
      "db.users.find({ age: { $gt: 1 }, id: 2 }, { name: 1, _id: 0 })",
    );
    expect(output('select "First Name" from "my-table"', "postgresql")).toBe('db.getCollection("my-table").find({}, { "First Name": 1, _id: 0 })');
  });

  it("uses distinct() for a single DISTINCT column", () => {
    expect(output("select distinct city from users where country = 'PK'")).toBe('db.users.distinct("city", { country: "PK" })');
    expect(output("select distinct city from users")).toBe('db.users.distinct("city")');
    expect(notes("select distinct a, b from t", "unsupported")).toEqual(["DISTINCT on several columns"]);
    expect(notes("select distinct a from t order by a", "unsupported")).toEqual(["DISTINCT with ORDER BY, LIMIT or OFFSET"]);
    expect(notes("select distinct on (a) a from t", "unsupported", "postgresql")).toEqual(["DISTINCT ON"]);
  });

  it("names each aggregation-only construct and gives no output", () => {
    const result = convert(
      "select city, count(*), case when a then 1 end from users join orders o on o.uid = users.id where x in (select y from z) group by city having count(*) > 1",
      "postgresql",
    );
    expect(result.output).toBeUndefined();
    expect(result.notes.map((n) => n.construct)).toEqual(["INNER JOIN", "GROUP BY", "HAVING", "COUNT()", "CASE WHEN", "Subquery"]);
    expect(result.notes.every((n) => n.level === "unsupported" && n.message.includes("aggregation pipeline"))).toBe(true);
  });

  it.each([
    ["select * from a, b", "Comma-separated tables (implicit join)"],
    ["select a from t union select a from u", "UNION"],
    ["with x as (select 1) select * from x", "WITH (common table expression)"],
    ["select row_number() over () from t", "Window function (OVER)"],
    ["select * from (select a from t) s", "Subquery"],
  ])("reports %j as %s", (sql, construct) => {
    expect(notes(sql, "unsupported", "postgresql")).toContain(construct);
  });

  it("refuses conditions find() can't express rather than guessing", () => {
    expect(notes("select * from t where lower(a) = 'x'", "unsupported")).toEqual(["Function lower(a)"]);
    expect(notes("select * from t where a = b", "unsupported")).toEqual(["Column comparison a = b"]);
    expect(notes("select * from t where a = ?", "unsupported")).toEqual(["Parameter ?"]);
    expect(notes("select * from t where a::int = 1", "unsupported", "postgresql")).toEqual(["Type cast a::INT"]);
    expect(notes("select * from t where a = null", "unsupported")).toEqual(["= NULL"]);
    expect(notes("select * from t where active", "unsupported", "postgresql")).toEqual(["Bare column active"]);
    expect(notes("select upper(a) from t", "unsupported")).toEqual(["Computed column upper(a)"]);
    expect(notes("select * from t order by 1", "unsupported")).toEqual(["ORDER BY 1"]);
    expect(notes("select * from t order by a nulls last", "unsupported", "postgresql")).toEqual(["NULLS LAST"]);
    expect(notes("select * from t where x.a = 1", "unsupported")).toEqual(["Table x"]);
  });

  it("drops caveats when nothing is output", () => {
    expect(convert("select * from t where a <> 1 group by a").notes.map((n) => n.level)).toEqual(["unsupported"]);
  });

  it("warns about NULL differences in negations and PostgreSQL sort order", () => {
    expect(notes("select * from t where a != 1", "caveat")).toEqual(["NULL handling"]);
    expect(notes("select * from t where a is not null", "caveat")).toEqual([]);
    expect(notes("select * from t order by a", "caveat", "postgresql")).toEqual(["NULL ordering"]);
    expect(notes("select * from t order by a", "caveat", "mysql")).toEqual([]);
  });

  it("only converts a single SELECT", () => {
    expect(notes("delete from t", "unsupported")).toEqual(["DELETE"]);
    expect(notes("select a from t; select b from u", "unsupported")).toEqual(["Multiple statements"]);
  });

  it("reports parse errors with their position", () => {
    expect(convertSqlToMongo("select a from t where", "mysql")).toEqual({
      ok: false,
      error: { message: "Unexpected end of query", line: 1, column: 22 },
    });
    expect(convertSqlToMongo("select a from t limit 2, 3", "postgresql")).toEqual({
      ok: false,
      error: { message: 'Unexpected ","', line: 1, column: 24 },
    });
    expect(convertSqlToMongo("  ", "mysql")).toEqual({ ok: false, error: { message: "Input is empty. Paste a SELECT query." } });
  });
});
