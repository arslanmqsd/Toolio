import type { EnvType } from "./env-parse";

export interface EnvField {
  key: string;
  type: EnvType;
  required: boolean;
  /** Secrets are left blank in .env.example and typed as SecretStr in pydantic. */
  secret: boolean;
  /** The pasted value. Only ever written to .env.example, never into code. */
  value: string;
}

export type EnvTarget = "zod" | "typescript" | "pydantic" | "python" | "example";

const NO_DOTENV_NODE =
  "// Node doesn't read .env files on its own: start it with `node --env-file=.env` (Node 20.6+) or load dotenv first.";

// ---------- TypeScript + Zod ----------

const ZOD_HELPERS: Partial<Record<EnvType, string>> = {
  integer: 'const integer = z.string().regex(/^-?\\d+$/, "Expected a whole number").transform(Number);',
  port: "const port = integer.pipe(z.number().min(1).max(65535));",
  number: "const number = z.string().trim().min(1).pipe(z.coerce.number());",
  boolean:
    '// z.coerce.boolean() would turn "false" into true, so match the text instead.\nconst boolean = z\n  .string()\n  .regex(/^(true|false|1|0)$/i, "Expected true or false")\n  .transform((value) => /^(true|1)$/i.test(value));',
  list: "const list = z.string().transform((value) =>\n  value\n    .split(\",\")\n    .map((item) => item.trim())\n    .filter(Boolean),\n);",
  json: 'const json = z.string().transform((value, ctx) => {\n  try {\n    return JSON.parse(value) as unknown;\n  } catch {\n    ctx.addIssue({ code: "custom", message: "Expected valid JSON" });\n    return z.NEVER;\n  }\n});',
};

const ZOD_SCHEMAS: Record<EnvType, string> = {
  string: "z.string().min(1)",
  integer: "integer",
  port: "port",
  number: "number",
  boolean: "boolean",
  url: "z.string().url()",
  email: "z.string().email()",
  json: "json",
  list: "list",
};

function zod(fields: EnvField[]): string {
  const types = new Set(fields.map((f) => f.type));
  if (types.has("port")) types.add("integer");
  const helpers = (Object.keys(ZOD_HELPERS) as EnvType[]).filter((t) => types.has(t)).map((t) => ZOD_HELPERS[t]);
  const anyOptional = fields.some((f) => !f.required);
  const out = ['import { z } from "zod";', "", NO_DOTENV_NODE, ""];
  if (helpers.length) out.push(helpers.join("\n\n"), "");
  if (anyOptional) {
    out.push(
      '// Treats KEY= (empty) the same as unset.\nconst optional = <T extends z.ZodTypeAny>(schema: T) =>\n  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());',
      "",
    );
  }
  out.push("const EnvSchema = z.object({");
  for (const f of fields) {
    const schema = ZOD_SCHEMAS[f.type];
    out.push(`  ${f.key}: ${f.required ? schema : `optional(${schema})`},`);
  }
  out.push(
    "});",
    "",
    "const parsed = EnvSchema.safeParse(process.env);",
    "if (!parsed.success) {",
    '  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);',
    '  throw new Error(`Invalid environment variables:\\n  - ${problems.join("\\n  - ")}`);',
    "}",
    "",
    "export const env = parsed.data;",
    "export type Env = z.infer<typeof EnvSchema>;",
    "",
  );
  return out.join("\n");
}

// ---------- TypeScript, no dependencies ----------

const TS_PARSERS: Record<EnvType, { name: string; code?: string }> = {
  string: { name: "text", code: "const text = (raw: string): string => raw;" },
  integer: {
    name: "integer",
    code: 'function integer(raw: string): number {\n  if (!/^-?\\d+$/.test(raw)) throw new Error("must be a whole number");\n  return Number(raw);\n}',
  },
  port: {
    name: "port",
    code: 'function port(raw: string): number {\n  const value = integer(raw);\n  if (value < 1 || value > 65535) throw new Error("must be a port from 1 to 65535");\n  return value;\n}',
  },
  number: {
    name: "number",
    code: 'function number(raw: string): number {\n  const value = Number(raw);\n  if (raw.trim() === "" || Number.isNaN(value)) throw new Error("must be a number");\n  return value;\n}',
  },
  boolean: {
    name: "boolean",
    code: 'function boolean(raw: string): boolean {\n  if (/^(true|1)$/i.test(raw)) return true;\n  if (/^(false|0)$/i.test(raw)) return false;\n  throw new Error("must be true or false");\n}',
  },
  url: {
    name: "url",
    code: 'function url(raw: string): string {\n  try {\n    new URL(raw);\n  } catch {\n    throw new Error("must be a full URL");\n  }\n  return raw;\n}',
  },
  email: {
    name: "email",
    code: 'function email(raw: string): string {\n  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(raw)) throw new Error("must be an email address");\n  return raw;\n}',
  },
  json: {
    name: "json",
    code: 'function json(raw: string): unknown {\n  try {\n    return JSON.parse(raw);\n  } catch {\n    throw new Error("must be valid JSON");\n  }\n}',
  },
  list: {
    name: "list",
    code: 'function list(raw: string): string[] {\n  return raw\n    .split(",")\n    .map((item) => item.trim())\n    .filter(Boolean);\n}',
  },
};

const PARSER_ORDER: EnvType[] = ["string", "integer", "port", "number", "boolean", "url", "email", "json", "list"];

function usedTypes(fields: EnvField[]): EnvType[] {
  const types = new Set(fields.map((f) => f.type));
  if (types.has("port")) types.add("integer");
  return PARSER_ORDER.filter((t) => types.has(t));
}

function typescript(fields: EnvField[]): string {
  const out = [
    "// Reads and checks environment variables once, when this module is first imported.",
    "// Every missing or invalid variable is reported together. Values are never included in errors.",
    NO_DOTENV_NODE,
    "",
    usedTypes(fields)
      .map((t) => TS_PARSERS[t].code)
      .join("\n\n"),
    "",
    "function loadEnv() {",
    "  const problems: string[] = [];",
    "",
    "  function read<T>(name: string, parse: (raw: string) => T): T;",
    "  function read<T>(name: string, parse: (raw: string) => T, optional: true): T | undefined;",
    "  function read<T>(name: string, parse: (raw: string) => T, optional = false): T | undefined {",
    "    const raw = process.env[name];",
    '    if (raw === undefined || raw === "") {',
    "      if (!optional) problems.push(`${name} is missing`);",
    "      return undefined;",
    "    }",
    "    try {",
    "      return parse(raw);",
    "    } catch (error) {",
    "      problems.push(`${name} ${(error as Error).message}`);",
    "      return undefined;",
    "    }",
    "  }",
    "",
    "  const env = {",
    ...fields.map((f) => `    ${f.key}: read("${f.key}", ${TS_PARSERS[f.type].name}${f.required ? "" : ", true"}),`),
    "  };",
    "",
    "  if (problems.length > 0) {",
    '    throw new Error(`Invalid environment variables:\\n  - ${problems.join("\\n  - ")}`);',
    "  }",
    "  return env;",
    "}",
    "",
    "export const env = loadEnv();",
    "export type Env = typeof env;",
    "",
  ];
  return out.join("\n");
}

// ---------- Python ----------

const PYTHON_KEYWORDS = new Set(
  "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case type".split(
    " ",
  ),
);

/** Snake-case attribute name for an env key, avoiding Python keywords. */
export function pythonName(key: string): string {
  const name = key.toLowerCase();
  return PYTHON_KEYWORDS.has(name) ? `${name}_` : name;
}

const PYDANTIC_TYPES: Record<EnvType, string> = {
  string: "str",
  integer: "int",
  port: "int",
  number: "float",
  boolean: "bool",
  url: "AnyUrl",
  email: "EmailStr",
  json: "Json[Any]",
  list: "Annotated[list[str], NoDecode]",
};

function pydantic(fields: EnvField[]): string {
  const pydanticImports = new Set(["Field"]);
  const typingImports = new Set<string>();
  const settingsImports = new Set(["BaseSettings", "SettingsConfigDict"]);
  const lines: string[] = [];
  const lists: string[] = [];

  for (const f of fields) {
    const name = pythonName(f.key);
    let type = f.type === "string" && f.secret ? "SecretStr" : PYDANTIC_TYPES[f.type];
    if (type === "SecretStr" || type === "AnyUrl" || type === "EmailStr") pydanticImports.add(type);
    if (f.type === "json") {
      pydanticImports.add("Json");
      typingImports.add("Any");
    }
    if (f.type === "list") {
      typingImports.add("Annotated");
      settingsImports.add("NoDecode");
      lists.push(name);
    }
    const args: string[] = [];
    if (!f.required) args.push("default=None");
    if (f.type === "port") args.push("ge=1", "le=65535");
    if (name !== f.key.toLowerCase()) args.push(`validation_alias="${f.key}"`);
    if (!f.required) type += " | None";
    const onlyDefault = args.length === 1 && args[0] === "default=None";
    const value = args.length === 0 ? "" : onlyDefault ? " = None" : ` = Field(${args.join(", ")})`;
    lines.push(`    ${name}: ${type}${value}`);
  }

  if (lists.length) {
    pydanticImports.add("field_validator");
    typingImports.add("Any");
  }
  if (!lines.some((l) => l.includes("Field("))) pydanticImports.delete("Field");

  const requires = fields.some((f) => f.type === "email") ? 'pip install pydantic-settings "pydantic[email]"' : "pip install pydantic-settings";
  const out = [`# Requires: ${requires}`];
  if (typingImports.size) out.push(`from typing import ${[...typingImports].sort().join(", ")}`, "");
  out.push(
    `from pydantic import ${[...pydanticImports].sort(pyImportOrder).join(", ")}`,
    `from pydantic_settings import ${[...settingsImports].sort().join(", ")}`,
    "",
    "",
    "class Settings(BaseSettings):",
    '    """Reads and checks environment variables (and .env) once, at startup."""',
    "",
    "    model_config = SettingsConfigDict(",
    '        env_file=".env",',
    "        env_ignore_empty=True,",
    '        extra="ignore",',
    "        # Keep values (which may be secrets) out of error messages and logs.",
    "        hide_input_in_errors=True,",
    "    )",
    "",
    ...lines,
  );
  if (lists.length) {
    out.push(
      "",
      `    @field_validator(${lists.map((n) => `"${n}"`).join(", ")}, mode="before")`,
      "    @classmethod",
      "    def _split_comma_lists(cls, value: Any) -> Any:",
      "        if isinstance(value, str):",
      '            return [item.strip() for item in value.split(",") if item.strip()]',
      "        return value",
    );
  }
  out.push("", "", "settings = Settings()", "");
  return out.join("\n");
}

/** Classes (capitalised) before functions, like isort. */
function pyImportOrder(a: string, b: string): number {
  const rank = (s: string) => (s[0] === s[0].toUpperCase() ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
}

const PY_PARSERS: Record<EnvType, { name: string; type: string; code?: string }> = {
  string: { name: "str", type: "str" },
  integer: {
    name: "_integer",
    type: "int",
    code: 'def _integer(raw: str) -> int:\n    if not re.fullmatch(r"-?\\d+", raw):\n        raise ValueError("must be a whole number")\n    return int(raw)',
  },
  port: {
    name: "_port",
    type: "int",
    code: 'def _port(raw: str) -> int:\n    value = _integer(raw)\n    if not 1 <= value <= 65535:\n        raise ValueError("must be a port from 1 to 65535")\n    return value',
  },
  number: {
    name: "_number",
    type: "float",
    code: 'def _number(raw: str) -> float:\n    try:\n        return float(raw)\n    except ValueError:\n        raise ValueError("must be a number") from None',
  },
  boolean: {
    name: "_boolean",
    type: "bool",
    code: 'def _boolean(raw: str) -> bool:\n    lowered = raw.lower()\n    if lowered in ("true", "1"):\n        return True\n    if lowered in ("false", "0"):\n        return False\n    raise ValueError("must be true or false")',
  },
  url: {
    name: "_url",
    type: "str",
    code: 'def _url(raw: str) -> str:\n    parsed = urlparse(raw)\n    if not (parsed.scheme and parsed.netloc):\n        raise ValueError("must be a full URL")\n    return raw',
  },
  email: {
    name: "_email",
    type: "str",
    code: 'def _email(raw: str) -> str:\n    if not re.fullmatch(r"[^\\s@]+@[^\\s@]+\\.[^\\s@]+", raw):\n        raise ValueError("must be an email address")\n    return raw',
  },
  json: {
    name: "_json",
    type: "Any",
    code: 'def _json(raw: str) -> Any:\n    try:\n        return json.loads(raw)\n    except json.JSONDecodeError:\n        raise ValueError("must be valid JSON") from None',
  },
  list: {
    name: "_list",
    type: "list[str]",
    code: 'def _list(raw: str) -> list[str]:\n    return [item.strip() for item in raw.split(",") if item.strip()]',
  },
};

function python(fields: EnvField[]): string {
  const types = usedTypes(fields);
  const imports = ["from __future__ import annotations", ""];
  if (types.includes("json")) imports.push("import json");
  imports.push("import os");
  if (types.some((t) => t === "integer" || t === "email")) imports.push("import re");
  imports.push("from dataclasses import dataclass", "from typing import Any, Callable, TypeVar");
  if (types.includes("url")) imports.push("from urllib.parse import urlparse");

  const helpers = types.map((t) => PY_PARSERS[t].code).filter(Boolean);
  const out = [
    '"""Reads and checks environment variables once, at import time.',
    "",
    "Every missing or invalid variable is reported together. Values are never included in errors.",
    "This doesn't read .env files: export the variables, or load them first with python-dotenv.",
    '"""',
    "",
    ...imports,
    "",
    'T = TypeVar("T")',
    "",
    "",
    helpers.join("\n\n\n"),
    "",
    "",
    "@dataclass(frozen=True)",
    "class Settings:",
    ...fields.map((f) => `    ${pythonName(f.key)}: ${PY_PARSERS[f.type].type}${f.required ? "" : " | None"}`),
    "",
    "",
    "def load_settings() -> Settings:",
    "    problems: list[str] = []",
    "",
    "    def read(name: str, parse: Callable[[str], T], optional: bool = False) -> T | None:",
    '        raw = os.environ.get(name, "")',
    '        if raw == "":',
    "            if not optional:",
    '                problems.append(f"{name} is missing")',
    "            return None",
    "        try:",
    "            return parse(raw)",
    "        except ValueError as error:",
    '            problems.append(f"{name} {error}")',
    "            return None",
    "",
    "    values: dict[str, Any] = {",
    ...fields.map((f) => `        "${pythonName(f.key)}": read("${f.key}", ${PY_PARSERS[f.type].name}${f.required ? "" : ", optional=True"}),`),
    "    }",
    "    if problems:",
    '        raise RuntimeError("Invalid environment variables:\\n  - " + "\\n  - ".join(problems))',
    "    return Settings(**values)",
    "",
    "",
    "settings = load_settings()",
    "",
  ];
  return out.join("\n");
}

// ---------- .env.example ----------

function quoteEnvValue(value: string): string {
  if (!/[\s#"'`\\]/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
}

function example(fields: EnvField[]): string {
  const out = ["# Copy to .env and fill in the blanks. Never commit the real .env.", ""];
  for (const f of fields) {
    const notes = [f.required ? "" : "Optional.", f.secret ? "Secret." : ""].filter(Boolean);
    if (notes.length) out.push(`# ${notes.join(" ")}`);
    out.push(`${f.key}=${f.secret ? "" : quoteEnvValue(f.value)}`);
  }
  return `${out.join("\n")}\n`;
}

export function generateEnvCode(fields: EnvField[], target: EnvTarget): string {
  switch (target) {
    case "zod":
      return zod(fields);
    case "typescript":
      return typescript(fields);
    case "pydantic":
      return pydantic(fields);
    case "python":
      return python(fields);
    case "example":
      return example(fields);
  }
}
