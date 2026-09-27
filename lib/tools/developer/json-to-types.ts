export type Language = "typescript" | "python" | "go";

type Primitive = "string" | "integer" | "number" | "boolean" | "null";

interface Field {
  type: JType;
  optional: boolean;
}

interface ObjectType {
  kind: "object";
  fields: Map<string, Field>;
}

/** Structural type inferred from JSON values. Unions never nest. */
export type JType =
  | { kind: Primitive }
  | { kind: "unknown" } // element type of an empty array
  | { kind: "array"; items: JType }
  | ObjectType
  | { kind: "union"; types: JType[] };

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

export function inferType(value: unknown): JType {
  if (value === null) return { kind: "null" };
  if (Array.isArray(value)) {
    return {
      kind: "array",
      items: value.reduce<JType>((acc, item) => mergeTypes(acc, inferType(item)), { kind: "unknown" }),
    };
  }
  switch (typeof value) {
    case "string":
      return { kind: "string" };
    case "number":
      return { kind: Number.isInteger(value) ? "integer" : "number" };
    case "boolean":
      return { kind: "boolean" };
    case "object": {
      const fields = new Map<string, Field>();
      for (const [key, child] of Object.entries(value as object)) {
        fields.set(key, { type: inferType(child), optional: false });
      }
      return { kind: "object", fields };
    }
    default:
      return { kind: "unknown" };
  }
}

const members = (t: JType): JType[] => (t.kind === "union" ? t.types : [t]);

const isNumeric = (t: JType) => t.kind === "integer" || t.kind === "number";

function compatible(a: JType, b: JType): boolean {
  return a.kind === b.kind || (isNumeric(a) && isNumeric(b));
}

/** Combines the types of two values that appear in the same position. */
export function mergeTypes(a: JType, b: JType): JType {
  if (a.kind === "unknown") return b;
  if (b.kind === "unknown") return a;

  const merged: JType[] = [];
  for (const t of [...members(a), ...members(b)]) {
    const i = merged.findIndex((m) => compatible(m, t));
    if (i === -1) merged.push(t);
    else merged[i] = mergeCompatible(merged[i], t);
  }
  return merged.length === 1 ? merged[0] : { kind: "union", types: merged };
}

function mergeCompatible(a: JType, b: JType): JType {
  if (isNumeric(a) && isNumeric(b)) {
    return { kind: a.kind === "number" || b.kind === "number" ? "number" : "integer" };
  }
  if (a.kind === "array" && b.kind === "array") {
    return { kind: "array", items: mergeTypes(a.items, b.items) };
  }
  if (a.kind === "object" && b.kind === "object") {
    return mergeObjects(a, b);
  }
  return a;
}

/** Keys missing from either side become optional. */
function mergeObjects(a: ObjectType, b: ObjectType): ObjectType {
  const fields = new Map<string, Field>();
  for (const [key, fa] of a.fields) {
    const fb = b.fields.get(key);
    fields.set(
      key,
      fb ? { type: mergeTypes(fa.type, fb.type), optional: fa.optional || fb.optional } : { ...fa, optional: true },
    );
  }
  for (const [key, fb] of b.fields) {
    if (!a.fields.has(key)) fields.set(key, { ...fb, optional: true });
  }
  return { kind: "object", fields };
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const GO_INITIALISMS = new Set([
  "acl", "api", "ascii", "cpu", "css", "db", "dns", "eof", "guid", "html", "http", "https", "id", "ip",
  "json", "sql", "ssh", "tcp", "tls", "ttl", "udp", "ui", "uid", "uri", "url", "utf8", "uuid", "xml",
]);

function splitWords(input: string): string[] {
  return input
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/** "user_name" → "UserName"; with Go initialisms "user_id" → "UserID". */
export function pascalCase(input: string, goInitialisms = false, fallback = "Type"): string {
  const name = splitWords(input)
    .map((word) => {
      const lower = word.toLowerCase();
      if (goInitialisms && GO_INITIALISMS.has(lower)) return lower.toUpperCase();
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join("");
  if (name === "") return fallback;
  return /^[0-9]/.test(name) ? fallback + name : name;
}

/** Naive English singular, good enough for type names: "orders" → "order". */
export function singularize(word: string): string {
  if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
  if (/sses$/i.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** Names every object type, in depth-first pre-order (parents before children). */
function nameObjects(root: JType, rootName: string, goInitialisms: boolean): Map<ObjectType, string> {
  const names = new Map<ObjectType, string>();
  const used = new Set<string>();

  function unique(base: string): string {
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}${n}`;
    used.add(name);
    return name;
  }

  function walk(t: JType, hint: string) {
    if (t.kind === "object") {
      names.set(t, unique(pascalCase(hint, goInitialisms)));
      for (const [key, field] of t.fields) walk(field.type, key);
    } else if (t.kind === "array") {
      const singular = singularize(hint);
      walk(t.items, singular === hint ? `${hint} item` : singular);
    } else if (t.kind === "union") {
      for (const member of t.types) walk(member, hint);
    }
  }

  walk(root, rootName);
  return names;
}

/** Puts null last so output reads "string | null", not "null | string". */
const nullLast = (types: JType[]) => [...types].sort((a, b) => Number(a.kind === "null") - Number(b.kind === "null"));

// ---------------------------------------------------------------------------
// TypeScript
// ---------------------------------------------------------------------------

function emitTypeScript(root: JType, rootName: string): string {
  const names = nameObjects(root, rootName, false);

  function ts(t: JType): string {
    switch (t.kind) {
      case "string":
      case "boolean":
      case "null":
      case "unknown":
        return t.kind;
      case "integer":
      case "number":
        return "number";
      case "array": {
        const inner = ts(t.items);
        return t.items.kind === "union" ? `(${inner})[]` : `${inner}[]`;
      }
      case "object":
        return names.get(t)!;
      case "union":
        return nullLast(t.types).map(ts).join(" | ");
    }
  }

  const blocks: string[] = [];
  if (root.kind !== "object") blocks.push(`export type ${pascalCase(rootName)} = ${ts(root)};`);
  for (const [obj, name] of names) {
    const lines = [...obj.fields].map(([key, field]) => {
      const prop = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
      return `  ${prop}${field.optional ? "?" : ""}: ${ts(field.type)};`;
    });
    blocks.push(lines.length ? `export interface ${name} {\n${lines.join("\n")}\n}` : `export interface ${name} {}`);
  }
  return blocks.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Python (TypedDict, Python 3.11+)
// ---------------------------------------------------------------------------

const PYTHON_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
  "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
  "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

const isPythonIdentifier = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !PYTHON_KEYWORDS.has(key);

function emitPython(root: JType, rootName: string): string {
  const names = nameObjects(root, rootName, false);
  const imports = new Set<string>();

  function py(t: JType): string {
    switch (t.kind) {
      case "string":
        return "str";
      case "integer":
        return "int";
      case "number":
        return "float";
      case "boolean":
        return "bool";
      case "null":
        return "None";
      case "unknown":
        imports.add("Any");
        return "Any";
      case "array":
        return `list[${py(t.items)}]`;
      case "object":
        return names.get(t)!;
      case "union":
        return nullLast(t.types).map(py).join(" | ");
    }
  }

  function fieldType(field: Field): string {
    if (!field.optional) return py(field.type);
    imports.add("NotRequired");
    return `NotRequired[${py(field.type)}]`;
  }

  // Python needs a class defined before it is referenced: emit children first.
  const blocks: string[] = [];
  for (const [obj, name] of [...names].reverse()) {
    imports.add("TypedDict");
    const entries = [...obj.fields];
    if (entries.every(([key]) => isPythonIdentifier(key))) {
      const body = entries.map(([key, field]) => `    ${key}: ${fieldType(field)}`);
      blocks.push(`class ${name}(TypedDict):\n${body.length ? body.join("\n") : "    pass"}`);
    } else {
      // Keys that aren't identifiers need the functional TypedDict syntax.
      const body = entries.map(([key, field]) => `    ${JSON.stringify(key)}: ${fieldType(field)},`);
      blocks.push(`${name} = TypedDict("${name}", {\n${body.join("\n")}\n})`);
    }
  }
  if (root.kind !== "object") blocks.push(`${pascalCase(rootName)} = ${py(root)}`);

  const header = imports.size ? `from typing import ${[...imports].sort().join(", ")}\n\n\n` : "";
  return header + blocks.join("\n\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

function emitGo(root: JType, rootName: string): string {
  const names = nameObjects(root, rootName, true);

  function go(t: JType): string {
    switch (t.kind) {
      case "string":
        return "string";
      case "integer":
        return "int";
      case "number":
        return "float64";
      case "boolean":
        return "bool";
      case "null":
      case "unknown":
        return "any";
      case "array":
        return `[]${go(t.items)}`;
      case "object":
        return names.get(t)!;
      case "union": {
        const nonNull = t.types.filter((m) => m.kind !== "null");
        if (nonNull.length !== 1) return "any";
        // Nullable value: pointer, unless the type already has a nil value.
        const inner = go(nonNull[0]);
        return inner === "any" || inner.startsWith("[]") ? inner : `*${inner}`;
      }
    }
  }

  const blocks: string[] = [];
  if (root.kind !== "object") blocks.push(`type ${pascalCase(rootName, true)} ${go(root)}`);
  for (const [obj, name] of names) {
    const used = new Set<string>();
    const rows = [...obj.fields].map(([key, field]) => {
      const base = pascalCase(key, true, "Field");
      let fieldName = base;
      for (let n = 2; used.has(fieldName); n++) fieldName = `${base}${n}`;
      used.add(fieldName);
      return [fieldName, go(field.type), `\`json:"${key}${field.optional ? ",omitempty" : ""}"\``];
    });
    // Align columns the way gofmt does.
    const nameWidth = Math.max(0, ...rows.map((r) => r[0].length));
    const typeWidth = Math.max(0, ...rows.map((r) => r[1].length));
    const body = rows.map(([n, t, tag]) => `\t${n.padEnd(nameWidth)} ${t.padEnd(typeWidth)} ${tag}`);
    blocks.push(`type ${name} struct {\n${body.map((line) => line + "\n").join("")}}`);
  }
  return blocks.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export type GenerateResult = { ok: true; code: string } | { ok: false; error: string };

const emitters: Record<Language, (root: JType, rootName: string) => string> = {
  typescript: emitTypeScript,
  python: emitPython,
  go: emitGo,
};

export function generateTypes(json: string, language: Language, rootName = "Root"): GenerateResult {
  if (json.trim() === "") return { ok: false, error: "Input is empty. Paste some JSON." };
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${(err as Error).message}` };
  }
  const name = pascalCase(rootName.trim() || "Root");
  return { ok: true, code: emitters[language](inferType(value), name) };
}
