import { Parser as MysqlParser } from "node-sql-parser/build/mysql";
import { Parser as PostgresParser } from "node-sql-parser/build/postgresql";
import { SQL_DIALECTS } from "./sql-format";

/** The sql-formatter dialects node-sql-parser can read, with the same ids and labels. */
export const MONGO_SQL_DIALECTS = SQL_DIALECTS.filter(
  (d): d is Extract<(typeof SQL_DIALECTS)[number], { id: "postgresql" | "mysql" }> =>
    d.id === "postgresql" || d.id === "mysql",
);

export type MongoSqlDialect = (typeof MONGO_SQL_DIALECTS)[number]["id"];

/**
 * "unsupported" means the query can't become a find() call, so no output is given.
 * "caveat" means the output is given but behaves differently from the SQL in a way worth knowing.
 */
export interface ConversionNote {
  level: "unsupported" | "caveat";
  construct: string;
  message: string;
}

export type SqlToMongoResult =
  | { ok: true; output?: string; notes: ConversionNote[] }
  | { ok: false; error: { message: string; line?: number; column?: number } };

// node-sql-parser's AST types describe its MySQL output; PostgreSQL nodes differ (columns are wrapped,
// DISTINCT is an object), so nodes are read loosely and checked field by field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>;

/** A JS value written into the output; plain objects and arrays nest. */
type Value = string | number | boolean | null | RawNumber | Value[] | { [key: string]: Value };
type Filter = { [key: string]: Value };

/** Number syntax written out as is, for integers too large to round-trip through a JS number. */
class RawNumber {
  constructor(readonly text: string) {}
}

const PIPELINE = "requires aggregation pipeline support (not yet available).";
const EXPR = "needs a MongoDB $expr, which this converter doesn't produce yet.";
const NULL_CAVEAT =
  "SQL's !=, NOT IN, NOT LIKE and NOT skip rows where the column is NULL; MongoDB's $ne, $nin, $not and $nor also match documents where the field is null or missing. Add { field: { $ne: null } } if that matters.";

const parsers = {
  mysql: { parser: new MysqlParser(), database: "MySQL" },
  postgresql: { parser: new PostgresParser(), database: "PostgresQL" },
};

const INT64_MIN = BigInt("-9223372036854775808");
const INT64_MAX = BigInt("9223372036854775807");

const COMPARISONS: Record<string, string> = { ">": "$gt", ">=": "$gte", "<": "$lt", "<=": "$lte", "!=": "$ne", "<>": "$ne" };
const FLIPPED: Record<string, string> = { ">": "<", ">=": "<=", "<": ">", "<=": ">=", "=": "=", "!=": "!=", "<>": "<>" };

export function convertSqlToMongo(input: string, dialect: MongoSqlDialect): SqlToMongoResult {
  if (input.trim() === "") return { ok: false, error: { message: "Input is empty. Paste a SELECT query." } };

  const { parser, database } = parsers[dialect];
  let ast: Node | Node[];
  try {
    ast = parser.astify(input, { database }) as Node | Node[];
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  const converter = new Converter(dialect, (node) => {
    try {
      // MySQL's printer backticks every identifier; only names that need it keep them.
      return parser.exprToSQL(node, { database }).replace(/`(\w+)`/g, "$1");
    } catch {
      return "expression";
    }
  });
  const output = converter.convert(Array.isArray(ast) ? ast : [ast]);
  const blockers = converter.notes.filter((n) => n.level === "unsupported");
  // With no output, caveats about how it would behave are noise.
  return blockers.length ? { ok: true, notes: blockers } : { ok: true, output, notes: converter.notes };
}

/** Peggy errors list every token the grammar expected; the part after "but" says what was actually there. */
function describeError(error: unknown): { message: string; line?: number; column?: number } {
  const raw = error instanceof Error ? error.message : String(error);
  const found = /but (.+?) found\.?$/.exec(raw)?.[1];
  const message = found === "end of input" ? "Unexpected end of query" : found ? `Unexpected ${found}` : raw.split("\n")[0];
  const start = (error as { location?: { start?: { line: number; column: number } } }).location?.start;
  return start ? { message, line: start.line, column: start.column } : { message };
}

class Converter {
  readonly notes: ConversionNote[] = [];
  /** Names a column may be qualified with: the table and its alias. */
  private tableNames = new Set<string>();
  /** SELECT aliases, so ORDER BY an alias sorts on the real field. */
  private aliases = new Map<string, string>();

  constructor(
    private dialect: MongoSqlDialect,
    private sql: (node: Node) => string,
  ) {}

  private note(level: ConversionNote["level"], construct: string, message: string) {
    if (!this.notes.some((n) => n.construct === construct && n.message === message)) this.notes.push({ level, construct, message });
  }

  private unsupported(construct: string, message: string): null {
    this.note("unsupported", construct, message);
    return null;
  }

  convert(statements: Node[]): string | undefined {
    if (statements.length !== 1) {
      this.unsupported("Multiple statements", "Convert one SELECT query at a time.");
      return undefined;
    }
    const select = statements[0];
    if (select.type !== "select") {
      this.unsupported(String(select.type).toUpperCase(), "Only SELECT queries convert to a find() call.");
      return undefined;
    }

    this.checkStructure(select);
    const from = select.from?.[0];
    if (!from?.table) return undefined;

    this.tableNames = new Set([from.table, from.as].filter(Boolean));
    const collection = /^[A-Za-z_]\w*$/.test(from.table) ? `db.${from.table}` : `db.getCollection(${JSON.stringify(from.table)})`;
    const filter = select.where ? this.condition(select.where) : {};

    const distinct = typeof select.distinct === "string" ? select.distinct : select.distinct?.type;
    if (distinct === "DISTINCT") return filter ? this.distinct(collection, select, filter) : undefined;
    if (distinct) this.unsupported(distinct, `${distinct} ${PIPELINE}`);

    const projection = this.projection(select.columns);
    const sort = this.sort(select.orderby);
    const { limit, skip } = this.limit(select.limit);
    if (projection === null || filter === null || sort === null || limit === null || skip === null) return undefined;

    const findArgs: Value[] = projection ? [filter, projection] : Object.keys(filter).length ? [filter] : [];
    const calls: [string, Value[]][] = [["find", findArgs]];
    if (sort) calls.push(["sort", [sort]]);
    if (skip !== undefined) calls.push(["skip", [skip]]);
    if (limit !== undefined) calls.push(["limit", [limit]]);
    return chain(collection, calls);
  }

  /** Clauses and expressions that only an aggregation pipeline could express; found anywhere in the query. */
  private checkStructure(select: Node) {
    if (select.with) this.unsupported("WITH (common table expression)", `WITH ${PIPELINE}`);
    if (select._next) {
      const op = String(select.set_op ?? "union").toUpperCase();
      this.unsupported(op, `${op} combines the results of several queries; it ${PIPELINE}`);
    }
    const from: Node[] = select.from ?? [];
    if (from.length === 0) this.unsupported("SELECT without FROM", "There's no table to turn into a collection.");
    for (const table of from.slice(1)) {
      const join = table.join ? String(table.join).toUpperCase() : "Comma-separated tables (implicit join)";
      this.unsupported(join, `Joining tables ${PIPELINE}`);
    }
    if (from.some((t) => t.expr?.ast)) this.unsupported("Subquery", `A subquery in FROM ${PIPELINE}`);
    if (select.groupby?.columns?.length) this.unsupported("GROUP BY", `GROUP BY ${PIPELINE}`);
    if (select.having) this.unsupported("HAVING", `HAVING ${PIPELINE}`);

    walk(select, (node) => {
      if (node.type === "aggr_func") this.unsupported(`${String(node.name).toUpperCase()}()`, `An aggregate function ${PIPELINE}`);
      else if (node.type === "window_func" || node.over) this.unsupported("Window function (OVER)", `A window function ${PIPELINE}`);
      else if (node.type === "case") this.unsupported("CASE WHEN", `A CASE expression ${PIPELINE}`);
      else if (node.ast && node !== select) this.unsupported("Subquery", `A subquery ${PIPELINE}`);
    });
  }

  /** Nodes checkStructure already reported; converting them again would only add a vaguer note. */
  private reported(node: Node) {
    return node.type === "aggr_func" || node.type === "window_func" || node.over || node.type === "case" || Boolean(node.ast);
  }

  private distinct(collection: string, select: Node, filter: Filter) {
    const columns: Node[] = select.columns;
    const only = columns.length === 1 ? columns[0].expr : undefined;
    if (only && this.reported(only)) return undefined;
    const field = only?.type === "column_ref" ? this.column(only) : null;
    if (!field || field === "*") {
      this.unsupported("DISTINCT on several columns", `distinct() returns the values of one field; DISTINCT over whole rows ${PIPELINE}`);
      return undefined;
    }
    if (select.orderby?.length || select.limit?.value?.length) {
      this.unsupported("DISTINCT with ORDER BY, LIMIT or OFFSET", `distinct() can't sort or page its values; that ${PIPELINE}`);
      return undefined;
    }
    this.note("caveat", "DISTINCT", "distinct() returns an array of values rather than documents, and it unwinds array fields into their elements.");
    return chain(collection, [["distinct", Object.keys(filter).length ? [field, filter] : [field]]]);
  }

  private projection(columns: Node[] | undefined): Filter | undefined | null {
    const projection: Filter = {};
    let star = false;
    let ok = true;
    for (const { expr, as } of columns ?? []) {
      if (this.reported(expr)) {
        ok = false;
        continue;
      }
      if (expr.type !== "column_ref") {
        ok = this.unsupported(`Computed column ${this.sql(expr)}`, "Computed columns need aggregation expressions in the projection, which this converter doesn't produce yet.") ?? false;
        continue;
      }
      const name = this.column(expr);
      if (name === null) ok = false;
      else if (name === "*") star = true;
      else if (as && as !== name) {
        projection[as] = `$${name}`;
        this.aliases.set(as, name);
        this.note("caveat", "Column alias", "Renaming fields in a find() projection needs MongoDB 4.4 or later.");
      } else projection[name] = 1;
    }
    if (!ok) return null;
    if (star) {
      if (this.aliases.size) return this.unsupported("* with renamed columns", `Adding renamed copies of fields ${PIPELINE}`);
      return undefined;
    }
    if (!("_id" in projection)) projection._id = 0;
    return projection;
  }

  /** The field a column reference names, or null if it's qualified with a table this query doesn't read. */
  private column(ref: Node): string | null {
    const name: string = typeof ref.column === "string" ? ref.column : ref.column?.expr?.value;
    if (ref.table && !this.tableNames.has(ref.table)) {
      return this.unsupported(`Table ${ref.table}`, `${ref.table}.${name} refers to a table that isn't in FROM.`);
    }
    return name;
  }

  private condition(node: Node): Filter | null {
    if (this.reported(node)) return null;

    if (node.type === "binary_expr") {
      const op = String(node.operator).toUpperCase();
      if (op === "AND") return this.and([...this.chainOf(node, "AND")]);
      if (op === "OR") {
        const parts = [...this.chainOf(node, "OR")].map((n) => this.condition(n));
        return parts.every(Boolean) ? { $or: parts as Filter[] } : null;
      }
      return this.predicate(op, node.left, node.right);
    }

    const isNot = (node.type === "unary_expr" && String(node.operator).toUpperCase() === "NOT") ||
      (node.type === "function" && node.name?.name?.[0]?.value?.toLowerCase() === "not" && node.args?.value?.length === 1);
    if (isNot) {
      const inner = this.condition(node.expr ?? node.args.value[0]);
      return inner && this.negate(inner);
    }

    if (node.type === "column_ref") {
      const name = this.column(node);
      return this.unsupported(`Bare column ${name}`, `A column on its own as a condition depends on how the database reads it as true; compare it explicitly, e.g. ${name} = true.`);
    }
    if (node.type === "function") return this.unsupported(`Function ${this.sql(node)}`, `A function in WHERE ${EXPR}`);
    return this.unsupported(`Condition ${this.sql(node)}`, `This kind of condition ${EXPR}`);
  }

  /** The operands of a run of the same operator, flattened: a AND (b AND c) gives a, b, c. */
  private *chainOf(node: Node, op: string): Generator<Node> {
    if (node.type === "binary_expr" && String(node.operator).toUpperCase() === op) {
      yield* this.chainOf(node.left, op);
      yield* this.chainOf(node.right, op);
    } else yield node;
  }

  /** Merges ANDed filters into one object when their fields don't clash, the way people write find() by hand. */
  private and(nodes: Node[]): Filter | null {
    const parts = nodes.map((n) => this.condition(n));
    if (!parts.every(Boolean)) return null;
    const merged: Filter = {};
    for (const part of parts as Filter[]) {
      for (const [key, value] of Object.entries(part)) {
        const existing = merged[key];
        if (existing === undefined) merged[key] = value;
        else if (isOperators(existing) && isOperators(value) && Object.keys(value).every((op) => !(op in existing))) {
          merged[key] = { ...existing, ...value };
        } else return { $and: parts as Filter[] };
      }
    }
    return merged;
  }

  private negate(filter: Filter): Filter {
    const entries = Object.entries(filter);
    if (entries.length === 1) {
      const [key, value] = entries[0];
      if (key === "$or") {
        this.note("caveat", "NULL handling", NULL_CAVEAT);
        return { $nor: value };
      }
      if (!key.startsWith("$")) {
        // NOT (x IS NULL) is exactly x IS NOT NULL, so no caveat there.
        if (value === null) return { [key]: { $ne: null } };
        if (isOperators(value)) {
          const ops = Object.keys(value);
          if (ops.length === 1 && ops[0] === "$ne") return { [key]: value.$ne };
          if (ops.length === 1 && ops[0] === "$nin") return { [key]: { $in: value.$nin } };
          if (ops.length === 1 && ops[0] === "$in") {
            this.note("caveat", "NULL handling", NULL_CAVEAT);
            return { [key]: { $nin: value.$in } };
          }
          this.note("caveat", "NULL handling", NULL_CAVEAT);
          return { [key]: { $not: value } };
        }
        this.note("caveat", "NULL handling", NULL_CAVEAT);
        return { [key]: { $ne: value } };
      }
    }
    this.note("caveat", "NULL handling", NULL_CAVEAT);
    return { $nor: [filter] };
  }

  /** A single comparison: column op value. */
  private predicate(op: string, left: Node, right: Node): Filter | null {
    if (this.reported(left) || this.reported(right)) return null;
    // `25 < age` reads the same as `age > 25`.
    if (left.type !== "column_ref" && right.type === "column_ref" && op in FLIPPED) [left, right, op] = [right, left, FLIPPED[op]];
    if (left.type !== "column_ref") return this.unsupported(this.describe(left), `A condition on a computed value ${EXPR}`);
    if (right.type === "column_ref") {
      return this.unsupported(`Column comparison ${this.sql(left)} ${op} ${this.sql(right)}`, `Comparing two fields ${EXPR}`);
    }
    const field = this.column(left);
    if (field === null) return null;

    if (op === "=" || op in COMPARISONS) {
      const value = this.literal(right);
      if (value === undefined) return null;
      if (value === null) {
        return this.unsupported(`${op} NULL`, `${field} ${op} NULL is never true in SQL; write ${field} IS ${op === "=" ? "" : "NOT "}NULL instead.`);
      }
      if (op === "=") return { [field]: value };
      if (COMPARISONS[op] === "$ne") this.note("caveat", "NULL handling", NULL_CAVEAT);
      return { [field]: { [COMPARISONS[op]]: value } };
    }

    if (op === "IN" || op === "NOT IN") {
      const values = this.literals(right);
      if (!values) return null;
      if (op === "NOT IN") this.note("caveat", "NULL handling", NULL_CAVEAT);
      return { [field]: { [op === "IN" ? "$in" : "$nin"]: values } };
    }

    if (op === "BETWEEN" || op === "NOT BETWEEN") {
      const bounds = this.literals(right);
      if (!bounds) return null;
      const range = { $gte: bounds[0], $lte: bounds[1] };
      return op === "BETWEEN" ? { [field]: range } : this.negate({ [field]: range });
    }

    if (op === "IS" || op === "IS NOT") {
      const value = this.literal(right);
      if (value === undefined) return null;
      if (value !== null && typeof value !== "boolean") return this.unsupported(`IS ${this.sql(right)}`, "IS only compares with NULL, TRUE or FALSE.");
      // { field: null } matches null and missing fields, which is what SQL NULL means for a document.
      return op === "IS" ? { [field]: value } : { [field]: { $ne: value } };
    }

    const like = /^(NOT )?(I?LIKE)$/.exec(op);
    if (like) {
      const regex = this.likeToRegex(right, like[2] === "ILIKE");
      if (!regex) return null;
      return like[1] ? this.negate({ [field]: regex }) : { [field]: regex };
    }

    return this.unsupported(`Operator ${op}`, `${op} has no find() equivalent here; it ${EXPR}`);
  }

  private likeToRegex(pattern: Node, ilike: boolean): Filter | null {
    const text = this.literal(pattern);
    if (text === undefined) return null;
    if (typeof text !== "string") return this.unsupported(`LIKE ${this.sql(pattern)}`, "LIKE needs a string pattern.");
    const escapeNode = pattern.escape?.value;
    const escape = escapeNode ? this.literal(escapeNode) : "\\";
    if (escape === undefined) return null;
    if (typeof escape !== "string" || escape.length !== 1) return this.unsupported("LIKE … ESCAPE", "ESCAPE needs a single character.");

    // "any" stands for %, "one" for _, strings are literal text.
    const tokens: ("any" | "one" | string)[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === escape && i + 1 < text.length) tokens.push(escapeRegex(text[++i]));
      else if (ch === "%") {
        if (tokens[tokens.length - 1] !== "any") tokens.push("any");
      } else if (ch === "_") tokens.push("one");
      else tokens.push(escapeRegex(ch));
    }
    // A leading or trailing % just drops the anchor.
    const anchorStart = tokens[0] !== "any";
    const anchorEnd = tokens[tokens.length - 1] !== "any";
    const body = tokens.slice(anchorStart ? 0 : 1, anchorEnd ? undefined : -1);
    const regex = (anchorStart ? "^" : "") + body.map((t) => (t === "any" ? ".*" : t === "one" ? "." : t)).join("") + (anchorEnd ? "$" : "");

    let options = "";
    if (ilike) options += "i";
    else if (this.dialect === "mysql") {
      options += "i";
      this.note("caveat", "LIKE case", "MySQL's default collations compare text case-insensitively, so the regex uses the i option. Remove it if the column uses a case-sensitive collation.");
    }
    // SQL wildcards match newlines; a regex dot only does with the s option.
    if (body.some((t) => t === "any" || t === "one")) options += "s";
    return options ? { $regex: regex, $options: options } : { $regex: regex };
  }

  private literals(node: Node): Value[] | null {
    if (node.type !== "expr_list") return this.unsupported(this.describe(node), "Only a list of plain values is supported here.");
    const values = (node.value as Node[]).map((n) => this.literal(n));
    return values.every((v) => v !== undefined) ? (values as Value[]) : null;
  }

  /** A plain value, or undefined (after noting why) if the node isn't one. */
  private literal(node: Node): Value | undefined {
    switch (node.type) {
      case "number":
      case "bigint": {
        const text = String(node.value);
        const number = Number(text);
        if (!/^-?\d+$/.test(text) || Number.isSafeInteger(number)) return number;
        // The shell reads a bare integer this big as a double and rounds it; NumberLong keeps it exact.
        const fitsLong = BigInt(text) >= INT64_MIN && BigInt(text) <= INT64_MAX;
        return new RawNumber(fitsLong ? `NumberLong(${JSON.stringify(text)})` : text);
      }
      case "bool":
        return Boolean(node.value);
      case "null":
        return null;
      case "single_quote_string":
      case "string":
        return this.unescape(String(node.value), "'");
      case "double_quote_string":
        // Only MySQL reads "…" as a string; PostgreSQL parses it as a column, so it never gets here.
        return this.unescape(String(node.value), '"');
    }
    if (this.reported(node)) return undefined;
    this.unsupported(this.describe(node), "Only plain values (numbers, strings, booleans, NULL) can be compared against.");
    return undefined;
  }

  /** The parser keeps string literals as written; undo the doubled quote, and MySQL's backslash escapes. */
  private unescape(text: string, quote: string) {
    const doubled = text.split(quote + quote).join(quote);
    if (this.dialect !== "mysql") return doubled;
    const escapes: Record<string, string> = { "0": "\0", b: "\b", n: "\n", r: "\r", t: "\t", Z: "\x1a" };
    // MySQL keeps \% and \_ as written so they can escape LIKE wildcards.
    return doubled.replace(/\\([\s\S])/g, (match, ch: string) => (ch === "%" || ch === "_" ? match : escapes[ch] ?? ch));
  }

  private describe(node: Node): string {
    const sql = this.sql(node);
    if (node.type === "function") return `Function ${sql}`;
    if (node.type === "cast") return `Type cast ${sql}`;
    if (node.type === "var" || node.type === "param" || (node.type === "origin" && node.value === "?")) return `Parameter ${sql}`;
    if (node.type === "binary_expr") return `Expression ${sql}`;
    return sql;
  }

  private sort(orderby: Node[] | null | undefined): Filter | undefined | null {
    if (!orderby?.length) return undefined;
    const sort: Filter = {};
    let ok = true;
    for (const { expr, type, nulls } of orderby) {
      const direction = String(type ?? "ASC").toUpperCase() === "DESC" ? -1 : 1;
      if (this.reported(expr)) {
        ok = false;
        continue;
      }
      if (expr.type === "number") {
        ok = this.unsupported(`ORDER BY ${expr.value}`, "Sorting by column position isn't supported; use the column name.") ?? false;
        continue;
      }
      if (expr.type !== "column_ref") {
        ok = this.unsupported(`ORDER BY ${this.sql(expr)}`, `Sorting by a computed value ${PIPELINE}`) ?? false;
        continue;
      }
      if (nulls) {
        // MongoDB puts null and missing values first when ascending and last when descending, and that can't be changed.
        const first = /first/i.test(nulls);
        if (first !== (direction === 1)) {
          ok = this.unsupported(String(nulls).toUpperCase(), `MongoDB always sorts null and missing values ${direction === 1 ? "first" : "last"} in this direction; changing that ${PIPELINE}`) ?? false;
          continue;
        }
      } else if (this.dialect === "postgresql") {
        this.note("caveat", "NULL ordering", "PostgreSQL sorts NULLs last when ascending and first when descending; MongoDB does the opposite.");
      }
      const name = this.column(expr);
      if (name === null) ok = false;
      else sort[this.aliases.get(name) ?? name] = direction;
    }
    return ok ? sort : null;
  }

  private limit(limit: Node | null | undefined): { limit?: number | null; skip?: number | null } {
    const values: Node[] = limit?.value ?? [];
    if (!values.length) return {};
    // MySQL's LIMIT 5, 10 puts the offset first; "LIMIT 10 OFFSET 5" and PostgreSQL's lone "OFFSET 5" don't.
    const [limitNode, skipNode] =
      limit!.seperator === "," ? [values[1], values[0]] : limit!.seperator === "offset" && values.length === 1 ? [undefined, values[0]] : [values[0], values[1]];
    const count = (node: Node | undefined, clause: string) => {
      if (!node || (node.type === "origin" && String(node.value).toLowerCase() === "all")) return undefined;
      if (node.type === "number" && Number.isInteger(Number(node.value))) return Number(node.value);
      return this.unsupported(`${clause} ${this.sql(node)}`, `${clause} needs a whole number.`);
    };
    return { limit: count(limitNode, "LIMIT"), skip: count(skipNode, "OFFSET") };
  }
}

function isOperators(value: Value | undefined): value is { [key: string]: Value } {
  return isPlainObject(value) && Object.keys(value).length > 0 && Object.keys(value).every((k) => k.startsWith("$"));
}

function isPlainObject(value: unknown): value is { [key: string]: Value } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof RawNumber);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Calls `visit` on every object in the AST, depth first. */
function walk(node: unknown, visit: (node: Node) => void) {
  if (Array.isArray(node)) node.forEach((child) => walk(child, visit));
  else if (typeof node === "object" && node !== null) {
    visit(node as Node);
    for (const child of Object.values(node)) walk(child, visit);
  }
}

const WIDTH = 80;

/** db.users.find(…).sort(…) on one line when it fits, otherwise one call per line. */
function chain(collection: string, calls: [string, Value[]][]) {
  const flat = collection + calls.map(([name, args]) => `.${name}(${args.map(inline).join(", ")})`).join("");
  if (flat.length <= WIDTH) return flat;
  return [collection, ...calls.map(([name, args]) => `  .${name}(${args.map((a) => toJs(a, 1)).join(", ")})`)].join("\n");
}

const isContainer = (value: Value): value is Value[] | { [key: string]: Value } => Array.isArray(value) || isPlainObject(value);

/** Shell-style JS: keys unquoted where possible, broken across lines only when a level is too wide. */
function toJs(value: Value, depth: number): string {
  const flat = inline(value);
  if (!isContainer(value) || flat.length + depth * 2 <= WIDTH) return flat;
  const pad = "  ".repeat(depth + 1);
  const items = Array.isArray(value)
    ? value.map((v) => toJs(v, depth + 1))
    : Object.entries(value).map(([k, v]) => `${key(k)}: ${toJs(v, depth + 1)}`);
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return `${open}\n${items.map((item) => pad + item).join(",\n")}\n${"  ".repeat(depth)}${close}`;
}

function inline(value: Value): string {
  if (value instanceof RawNumber) return value.text;
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return entries.length ? `{ ${entries.map(([k, v]) => `${key(k)}: ${inline(v)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(value);
}

const key = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));
